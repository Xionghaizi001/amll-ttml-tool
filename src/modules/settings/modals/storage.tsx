import {
	ArrowSync20Regular,
	Database24Regular,
	Delete20Regular,
	Storage24Regular,
} from "@fluentui/react-icons";
import { Button, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pushNotificationAtom } from "$/states/notifications";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

type StorageEntry = {
	key: string;
	label: string;
	size: number | null;
	dbNames: string[];
};

const KNOWN_DB_NAMES = [
	"amll-audio-cache",
	"amll-autosave-db",
	"amll-custom-background",
	"review-cache",
	"review-template-db",
];

const IDB_REQUEST_TIMEOUT_MS = 2000;

const withTimeout = <T,>(promise: Promise<T>) =>
	new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(
			() => reject(new Error("IndexedDB request timed out")),
			IDB_REQUEST_TIMEOUT_MS,
		);
		promise.then(
			(value) => {
				clearTimeout(timeoutId);
				resolve(value);
			},
			(error) => {
				clearTimeout(timeoutId);
				reject(error);
			},
		);
	});

const openDb = (name: string) =>
	new Promise<IDBDatabase>((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			callback();
		};
		const timeoutId = setTimeout(
			() => finish(() => reject(new Error("IndexedDB open timed out"))),
			IDB_REQUEST_TIMEOUT_MS,
		);
		const request = indexedDB.open(name);
		request.onsuccess = () => {
			const db = request.result;
			if (settled) {
				db.close();
				return;
			}
			finish(() => resolve(db));
		};
		request.onerror = () =>
			finish(() => reject(request.error ?? new Error("IndexedDB open failed")));
		request.onblocked = () =>
			finish(() => reject(new Error("IndexedDB open blocked")));
	});

const estimateValueSize = (
	value: unknown,
	visited: WeakSet<object>,
): number => {
	if (value === null || value === undefined) return 0;
	if (typeof value === "string") return value.length * 2;
	if (typeof value === "number") return 8;
	if (typeof value === "boolean") return 4;
	if (typeof value === "bigint") return 8;
	if (value instanceof Date) return 8;
	if (value instanceof Blob) return value.size;
	if (value instanceof ArrayBuffer) return value.byteLength;
	if (ArrayBuffer.isView(value)) return value.byteLength;
	if (typeof value !== "object") return 0;
	if (visited.has(value)) return 0;
	visited.add(value);
	if (Array.isArray(value)) {
		return value.reduce(
			(sum, item) => sum + estimateValueSize(item, visited),
			0,
		);
	}
	let size = 0;
	for (const [key, item] of Object.entries(value)) {
		size += estimateValueSize(key, visited);
		size += estimateValueSize(item, visited);
	}
	return size;
};

const estimateStoreSize = (db: IDBDatabase, storeName: string) =>
	new Promise<number | null>((resolve) => {
		let size = 0;
		let settled = false;
		const finish = (value: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			resolve(value);
		};
		const timeoutId = setTimeout(() => finish(null), IDB_REQUEST_TIMEOUT_MS);
		try {
			const tx = db.transaction(storeName, "readonly");
			const store = tx.objectStore(storeName);
			const request = store.openCursor();
			request.onsuccess = () => {
				if (settled) return;
				const cursor = request.result;
				if (!cursor) {
					finish(size);
					return;
				}
				size += estimateValueSize(cursor.value, new WeakSet());
				cursor.continue();
			};
			request.onerror = () => finish(null);
			tx.onabort = () => finish(null);
			tx.onerror = () => finish(null);
		} catch {
			finish(null);
		}
	});

const estimateDbSize = async (name: string) => {
	let db: IDBDatabase | null = null;
	try {
		db = await openDb(name);
		const storeNames = Array.from(db.objectStoreNames);
		let total = 0;
		for (const storeName of storeNames) {
			const storeSize = await estimateStoreSize(db, storeName);
			if (storeSize === null) return null;
			total += storeSize;
		}
		return total;
	} catch {
		return null;
	} finally {
		db?.close();
	}
};

const getDbNames = async () => {
	const factory = indexedDB as IDBFactory & {
		databases?: () => Promise<IDBDatabaseInfo[]>;
	};
	if (!factory.databases) return [];
	try {
		const databases = await withTimeout(factory.databases());
		return databases.map((db) => db.name).filter(Boolean) as string[];
	} catch {
		return [];
	}
};

type DeleteDbResult = "deleted" | "blocked" | "failed";

const deleteDb = (name: string) =>
	new Promise<DeleteDbResult>((resolve) => {
		let settled = false;
		const finish = (result: DeleteDbResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			resolve(result);
		};
		const timeoutId = setTimeout(
			() => finish("blocked"),
			IDB_REQUEST_TIMEOUT_MS,
		);
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => finish("deleted");
		request.onerror = () => finish("failed");
		request.onblocked = () => finish("blocked");
	});

const formatBytes = (value: number) => {
	if (value <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const base = 1024;
	let size = value;
	let index = 0;
	while (size >= base && index < units.length - 1) {
		size /= base;
		index += 1;
	}
	return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

export const SettingsStorageTab = () => {
	const { t } = useTranslation();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const [entries, setEntries] = useState<StorageEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [clearingKey, setClearingKey] = useState<string | null>(null);
	const [totalSize, setTotalSize] = useState<number | null>(null);

	const refreshEntries = useCallback(async () => {
		setLoading(true);
		try {
			const availableNames = await getDbNames();
			const availableSet = new Set(availableNames);
			const shouldEstimate = availableNames.length > 0;
			const nextEntries: StorageEntry[] = [];
			for (const name of KNOWN_DB_NAMES) {
				const size =
					shouldEstimate && availableSet.has(name)
						? await estimateDbSize(name)
						: shouldEstimate
							? 0
							: null;
				nextEntries.push({
					key: name,
					label: name,
					size,
					dbNames: [name],
				});
			}
			const otherNames = availableNames.filter(
				(name) => !KNOWN_DB_NAMES.includes(name),
			);
			let otherSize: number | null = shouldEstimate ? 0 : null;
			if (shouldEstimate) {
				let sum = 0;
				let hasUnknownSize = false;
				for (const name of otherNames) {
					const size = await estimateDbSize(name);
					if (size === null) {
						hasUnknownSize = true;
						continue;
					}
					sum += size;
				}
				otherSize = hasUnknownSize ? null : sum;
			}
			nextEntries.push({
				key: "other",
				label: "other",
				size: otherSize,
				dbNames: otherNames,
			});
			setEntries(nextEntries);
			setTotalSize(
				nextEntries.every((entry) => entry.size !== null)
					? nextEntries.reduce((sum, entry) => sum + (entry.size ?? 0), 0)
					: null,
			);
		} catch {
			setEntries([]);
			setTotalSize(null);
			setPushNotification({
				title: t("storage.loadFailed", "读取存储信息失败"),
				level: "error",
				source: "Storage",
			});
		} finally {
			setLoading(false);
		}
	}, [setPushNotification, t]);

	useEffect(() => {
		refreshEntries();
	}, [refreshEntries]);

	const labelMap = useMemo(
		() => ({
			"amll-audio-cache": t("storage.audioCache", "音频缓存"),
			"amll-autosave-db": t("storage.autosaveCache", "自动保存缓存"),
			"amll-custom-background": t("storage.backgroundCache", "背景图像缓存"),
			"review-cache": t("storage.reviewCache", "审阅功能缓存"),
			"review-template-db": t("storage.reviewTemplateCache", "审阅模板缓存"),
			other: t("storage.otherCache", "其他"),
		}),
		[t],
	);

	const handleClear = useCallback(
		async (entry: StorageEntry) => {
			if (entry.dbNames.length === 0) {
				setPushNotification({
					title: t("storage.clearEmpty", "没有可清除的缓存"),
					level: "info",
					source: "Storage",
				});
				return;
			}
			setClearingKey(entry.key);
			try {
				const results = await Promise.all(entry.dbNames.map(deleteDb));
				if (results.includes("blocked")) {
					setPushNotification({
						title: t("storage.clearBlocked", "缓存正在被使用，稍后将重新计算"),
						level: "warning",
						source: "Storage",
					});
				} else if (results.includes("failed")) {
					setPushNotification({
						title: t("storage.clearFailed", "清除缓存失败"),
						level: "error",
						source: "Storage",
					});
				} else {
					setPushNotification({
						title: t("storage.clearSuccess", "已清除缓存"),
						level: "success",
						source: "Storage",
					});
				}
				await refreshEntries();
			} finally {
				setClearingKey(null);
			}
		},
		[refreshEntries, setPushNotification, t],
	);

	const describeSize = (entry: StorageEntry) => {
		if (loading && entry.size === null) {
			return t("storage.loading", "加载中");
		}
		if (entry.size === null) {
			return t("storage.unknown", "未知");
		}
		return formatBytes(entry.size);
	};

	const describeTotalSize = () => {
		if (loading && totalSize === null) {
			return t("storage.loading", "加载中");
		}
		if (totalSize === null) {
			return t("storage.unknown", "未知");
		}
		return formatBytes(totalSize);
	};

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup title={t("storage.localCaches", "本地缓存")}>
				<SettingsRow
					icon={<Storage24Regular />}
					title={t("storage.totalUsage", "总占用空间")}
					description={describeTotalSize()}
					action={
						<Button variant="soft" disabled={loading} onClick={refreshEntries}>
							<ArrowSync20Regular />
							{t("storage.refresh", "刷新")}
						</Button>
					}
				/>
				{entries.map((entry) => (
					<SettingsRow
						key={entry.key}
						icon={<Database24Regular />}
						title={labelMap[entry.key as keyof typeof labelMap]}
						description={describeSize(entry)}
						action={
							<Tooltip content={t("storage.clear", "清除")}>
								<IconButton
									aria-label={t("storage.clear", "清除")}
									variant="soft"
									color="red"
									disabled={
										loading ||
										clearingKey === entry.key ||
										entry.dbNames.length === 0
									}
									onClick={() => handleClear(entry)}
								>
									<Delete20Regular />
								</IconButton>
							</Tooltip>
						}
					/>
				))}
			</SettingsGroup>
		</Flex>
	);
};
