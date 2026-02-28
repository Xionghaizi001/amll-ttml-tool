import { Button, Card, Dialog, Flex, Text } from "@radix-ui/themes";
import { Delete20Regular } from "@fluentui/react-icons";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { storageManagerDialogAtom } from "$/states/dialogs";
import { pushNotificationAtom } from "$/states/notifications";

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

const openDb = (name: string) =>
	new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onupgradeneeded = () => resolve(request.result);
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
	new Promise<number>((resolve) => {
		let size = 0;
		const tx = db.transaction(storeName, "readonly");
		const store = tx.objectStore(storeName);
		const request = store.openCursor();
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) {
				resolve(size);
				return;
			}
			size += estimateValueSize(cursor.value, new WeakSet());
			cursor.continue();
		};
		request.onerror = () => resolve(size);
	});

const estimateDbSize = async (name: string) => {
	const db = await openDb(name);
	const storeNames = Array.from(db.objectStoreNames);
	let total = 0;
	for (const storeName of storeNames) {
		total += await estimateStoreSize(db, storeName);
	}
	db.close();
	return total;
};

const getDbNames = async () => {
	const factory = indexedDB as IDBFactory & {
		databases?: () => Promise<IDBDatabaseInfo[]>;
	};
	if (!factory.databases) return [];
	try {
		const databases = await factory.databases();
		return databases.map((db) => db.name).filter(Boolean) as string[];
	} catch {
		return [];
	}
};

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

export const StorageManagerDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(storageManagerDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const [entries, setEntries] = useState<StorageEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [clearingKey, setClearingKey] = useState<string | null>(null);

	const refreshEntries = useCallback(async () => {
		setLoading(true);
		try {
			const availableNames = await getDbNames();
			const availableSet = new Set(availableNames);
			const shouldEstimate = availableNames.length > 0;
			const knownEntries: StorageEntry[] = [];
			for (const name of KNOWN_DB_NAMES) {
				const size =
					shouldEstimate && availableSet.has(name)
						? await estimateDbSize(name)
						: shouldEstimate
							? 0
							: null;
				knownEntries.push({
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
				for (const name of otherNames) {
					sum += await estimateDbSize(name);
				}
				otherSize = sum;
			}
			knownEntries.push({
				key: "other",
				label: "other",
				size: otherSize,
				dbNames: otherNames,
			});
			setEntries(knownEntries);
		} catch (error) {
			setEntries([]);
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
		if (open) {
			refreshEntries();
		}
	}, [open, refreshEntries]);

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
				await Promise.all(
					entry.dbNames.map(
						(name) =>
							new Promise<void>((resolve) => {
								const request = indexedDB.deleteDatabase(name);
								request.onsuccess = () => resolve();
								request.onerror = () => resolve();
								request.onblocked = () => resolve();
							}),
					),
				);
				setPushNotification({
					title: t("storage.clearSuccess", "已清除缓存"),
					level: "success",
					source: "Storage",
				});
				await refreshEntries();
			} finally {
				setClearingKey(null);
			}
		},
		[refreshEntries, setPushNotification, t],
	);

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="640px">
				<Dialog.Title>
					{t("storage.dialogTitle", "存储管理")}
				</Dialog.Title>
				<Flex direction="column" gap="3">
					<Text size="2" color="gray">
						{t("storage.dialogDesc", "查看并清理本地 IndexedDB 缓存")}
					</Text>
					{entries.map((entry) => (
						<Card key={entry.key}>
							<Flex align="center" justify="between" gap="4">
								<Flex direction="column" gap="1">
									<Text>{labelMap[entry.key as keyof typeof labelMap]}</Text>
									<Text size="1" color="gray">
										{loading
											? t("storage.loading", "加载中")
											: entry.size === null
												? t("storage.unknown", "未知")
												: formatBytes(entry.size)}
									</Text>
								</Flex>
								<Button
									variant="soft"
									color="red"
									onClick={() => handleClear(entry)}
									disabled={loading || clearingKey === entry.key}
								>
									<Delete20Regular />
									{t("storage.clear", "清除")}
								</Button>
							</Flex>
						</Card>
					))}
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
