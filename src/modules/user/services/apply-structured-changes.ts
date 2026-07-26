import type {
	StructuredReviewChange,
	StructuredReviewValue,
} from "$/types/structured-review-report";
import type { TTMLLyric } from "$/types/ttml";
import { pathKey } from "$/utils/content-addressed-id";
import { uid } from "uid";

export type ApplyStructuredChangesOptions = {
	/** 是否在写入前校验当前值与 before 一致；默认 true。 */
	verifyBefore?: boolean;
};

export type ApplyStructuredChangesFailure = {
	path: Array<string | number>;
	reason: string;
};

export type ApplyStructuredChangesResult = {
	lyrics: TTMLLyric;
	applied: StructuredReviewChange[];
	failed: ApplyStructuredChangesFailure[];
};

const valuesEqual = (left: unknown, right: unknown) =>
	JSON.stringify(left) === JSON.stringify(right);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const cloneLyrics = (lyrics: TTMLLyric): TTMLLyric => structuredClone(lyrics);

const getAtPath = (
	root: unknown,
	path: Array<string | number>,
): { exists: boolean; value: unknown; parent: unknown; key: string | number | null } => {
	if (path.length === 0) {
		return { exists: true, value: root, parent: null, key: null };
	}
	let current: unknown = root;
	for (let i = 0; i < path.length - 1; i += 1) {
		const segment = path[i];
		if (Array.isArray(current)) {
			if (typeof segment !== "number" || segment < 0 || segment >= current.length) {
				return { exists: false, value: undefined, parent: null, key: null };
			}
			current = current[segment];
			continue;
		}
		if (!isObjectRecord(current) || !Object.hasOwn(current, String(segment))) {
			return { exists: false, value: undefined, parent: null, key: null };
		}
		current = current[segment as string];
	}
	const last = path[path.length - 1];
	if (Array.isArray(current)) {
		if (typeof last !== "number") {
			return { exists: false, value: undefined, parent: current, key: last };
		}
		return {
			exists: last >= 0 && last < current.length,
			value: last >= 0 && last < current.length ? current[last] : undefined,
			parent: current,
			key: last,
		};
	}
	if (!isObjectRecord(current)) {
		return { exists: false, value: undefined, parent: null, key: last };
	}
	const key = String(last);
	return {
		exists: Object.hasOwn(current, key),
		value: current[key],
		parent: current,
		key,
	};
};

const setAtPath = (
	root: TTMLLyric,
	path: Array<string | number>,
	value: StructuredReviewValue,
): boolean => {
	if (path.length === 0) return false;
	const parentPath = path.slice(0, -1);
	const last = path[path.length - 1];
	const parentLookup = getAtPath(root, parentPath);
	if (!parentLookup.exists || parentLookup.value === undefined) return false;
	const parent = parentLookup.value;
	if (Array.isArray(parent)) {
		if (typeof last !== "number" || last < 0 || last > parent.length) return false;
		if (last === parent.length) {
			parent.push(value);
		} else {
			parent[last] = value;
		}
		return true;
	}
	if (!isObjectRecord(parent)) return false;
	parent[String(last)] = value;
	return true;
};

const deleteAtPath = (
	root: TTMLLyric,
	path: Array<string | number>,
): boolean => {
	if (path.length === 0) return false;
	const { exists, parent, key } = getAtPath(root, path);
	if (!exists || parent === null || key === null) return false;
	if (Array.isArray(parent)) {
		if (typeof key !== "number" || key < 0 || key >= parent.length) return false;
		parent.splice(key, 1);
		return true;
	}
	if (!isObjectRecord(parent)) return false;
	delete parent[String(key)];
	return true;
};

/**
 * 删除优先：更深 path 先处理；同深度则数组下标从大到小，避免下标漂移。
 * 非删除（写入/插入）保持 path 字典序，便于确定性。
 */
const compareChangesForApply = (
	left: StructuredReviewChange,
	right: StructuredReviewChange,
): number => {
	const leftDelete = left.beforeExists && !left.afterExists;
	const rightDelete = right.beforeExists && !right.afterExists;
	if (leftDelete !== rightDelete) return leftDelete ? -1 : 1;

	if (leftDelete && rightDelete) {
		const depth = right.path.length - left.path.length;
		if (depth !== 0) return depth;
		for (let i = 0; i < left.path.length; i += 1) {
			const a = left.path[i];
			const b = right.path[i];
			if (typeof a === "number" && typeof b === "number" && a !== b) {
				return b - a;
			}
			if (a !== b) return pathKey(left.path).localeCompare(pathKey(right.path));
		}
		return 0;
	}

	return pathKey(left.path).localeCompare(pathKey(right.path));
};

/** 结构化 after 可能缺编辑器运行时 id（导出协议不含 id）。 */
const ensureRuntimeIds = (lyrics: TTMLLyric): TTMLLyric => {
	for (const line of lyrics.lyricLines) {
		if (!line.id) line.id = uid();
		for (const word of line.words ?? []) {
			if (!word.id) word.id = uid();
			if (typeof word.obscene !== "boolean") word.obscene = false;
			if (typeof word.emptyBeat !== "number") word.emptyBeat = 0;
			if (typeof word.romanWord !== "string") word.romanWord = "";
		}
	}
	return lyrics;
};

/**
 * 在冻结原稿上应用勾选的结构化变更（path 坐标系）。
 * 不处理「基线已漂移」场景；调用方应先校验 contentHash。
 */
export const applyStructuredChanges = (
	original: TTMLLyric,
	changes: StructuredReviewChange[],
	options: ApplyStructuredChangesOptions = {},
): ApplyStructuredChangesResult => {
	const verifyBefore = options.verifyBefore !== false;
	const lyrics = cloneLyrics(original);
	const applied: StructuredReviewChange[] = [];
	const failed: ApplyStructuredChangesFailure[] = [];
	const ordered = [...changes].sort(compareChangesForApply);

	for (const change of ordered) {
		const { path, beforeExists, afterExists, before, after } = change;
		const current = getAtPath(lyrics, path);

		if (beforeExists && afterExists) {
			if (!current.exists) {
				failed.push({ path, reason: "目标路径不存在，无法更新" });
				continue;
			}
			if (verifyBefore && !valuesEqual(current.value, before)) {
				failed.push({
					path,
					reason: "当前值与 before 不一致，拒绝覆盖",
				});
				continue;
			}
			if (after === null) {
				failed.push({ path, reason: "更新变更缺少 after 值" });
				continue;
			}
			if (!setAtPath(lyrics, path, after)) {
				failed.push({ path, reason: "写入路径失败" });
				continue;
			}
			applied.push(change);
			continue;
		}

		if (beforeExists && !afterExists) {
			if (!current.exists) {
				// 已不存在则视为删除成功（幂等）
				applied.push(change);
				continue;
			}
			if (verifyBefore && !valuesEqual(current.value, before)) {
				failed.push({
					path,
					reason: "当前值与 before 不一致，拒绝删除",
				});
				continue;
			}
			if (!deleteAtPath(lyrics, path)) {
				failed.push({ path, reason: "删除路径失败" });
				continue;
			}
			applied.push(change);
			continue;
		}

		if (!beforeExists && afterExists) {
			if (current.exists) {
				if (verifyBefore && !valuesEqual(current.value, after)) {
					failed.push({
						path,
						reason: "目标路径已存在且与 after 不同",
					});
					continue;
				}
				// 已是期望值则幂等成功
				applied.push(change);
				continue;
			}
			if (after === null) {
				failed.push({ path, reason: "新增变更缺少 after 值" });
				continue;
			}
			if (!setAtPath(lyrics, path, after)) {
				failed.push({ path, reason: "插入路径失败" });
				continue;
			}
			applied.push(change);
			continue;
		}

		failed.push({ path, reason: "无效变更：before/after 均不存在" });
	}

	return { lyrics: ensureRuntimeIds(lyrics), applied, failed };
};
