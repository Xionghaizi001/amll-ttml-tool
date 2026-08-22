import {
	Button,
	Dialog,
	Flex,
	ScrollArea,
	Select,
	Text,
	TextArea,
	Theme,
} from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import {
	ExtismWorkerRuntime,
	PluginRuntimeError,
	type PluginRuntimeMetric,
	resolveWasiMode,
	type WasmLoadMode,
} from "../runtime";
import {
	createJsonPayload,
	summarizeDurations,
} from "./plugin-runtime-benchmark.ts";

const SAMPLE_INPUT = JSON.stringify(
	{ kind: "plugin-runtime-poc", message: "hello from AMLL" },
	null,
	2,
);

function formatMetrics(metrics: readonly PluginRuntimeMetric[]): string {
	return metrics
		.map(
			(metric) =>
				`${metric.operation} ${metric.durationMs.toFixed(1)} ms, input=${metric.inputBytes} B, output=${metric.outputBytes} B`,
		)
		.join("\n");
}

function formatError(error: unknown): string {
	if (error instanceof PluginRuntimeError) {
		return `${error.code}: ${error.message}`;
	}
	return String(error);
}

function getUsedHeapSize(): number | null {
	const memory = (
		performance as Performance & {
			memory?: { usedJSHeapSize: number };
		}
	).memory;
	return memory?.usedJSHeapSize ?? null;
}

function formatBytes(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

export default function PluginRuntimeDiagnostics() {
	const runtimeRef = useRef<ExtismWorkerRuntime | null>(null);
	const [open, setOpen] = useState(true);
	const [wasm, setWasm] = useState<Uint8Array | null>(null);
	const [wasmLabel, setWasmLabel] = useState("未加载插件");
	const [wasmUseWasi, setWasmUseWasi] = useState(false);
	const [wasmLoadMode, setWasmLoadMode] = useState<WasmLoadMode>("auto");
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("等待加载 WASM 插件");
	const [output, setOutput] = useState("");
	const [metrics, setMetrics] = useState<readonly PluginRuntimeMetric[]>([]);

	useEffect(() => {
		const runtime = new ExtismWorkerRuntime({ timeoutMs: 5000 });
		runtimeRef.current = runtime;
		return () => {
			void runtime.close();
			runtimeRef.current = null;
		};
	}, []);

	const refreshMetrics = () => {
		setMetrics(runtimeRef.current?.getMetrics() ?? []);
	};

	const loadBytes = async (
		bytes: Uint8Array,
		label: string,
		loadMode: WasmLoadMode = "auto",
	) => {
		const runtime = runtimeRef.current;
		if (!runtime) return;
		setBusy(true);
		try {
			const useWasi = resolveWasiMode(bytes, loadMode);
			await runtime.load(bytes, { useWasi });
			setWasm(bytes);
			setWasmLabel(label);
			setWasmUseWasi(useWasi);
			setStatus(`已加载 ${label}（WASI=${String(useWasi)}）`);
			setOutput("");
		} catch (error) {
			setStatus(formatError(error));
		} finally {
			refreshMetrics();
			setBusy(false);
		}
	};

	const loadSample = async () => {
		try {
			const url = new URL("plugins/echo.wasm", document.baseURI);
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`无法加载示例插件：HTTP ${response.status}`);
			}
			await loadBytes(
				new Uint8Array(await response.arrayBuffer()),
				"echo.wasm",
				"disabled",
			);
		} catch (error) {
			setStatus(formatError(error));
		}
	};

	const loadPdkSample = async (label: "rust" | "csharp") => {
		try {
			const fileName =
				label === "rust" ? "rust-pdk-echo.wasm" : "csharp-pdk-echo.wasm";
			const url = new URL(`plugins/${fileName}`, document.baseURI);
			const response = await fetch(url);
			if (!response.ok)
				throw new Error(`无法加载 ${fileName}：HTTP ${response.status}`);
			await loadBytes(
				new Uint8Array(await response.arrayBuffer()),
				fileName,
				label === "csharp" ? "enabled" : "disabled",
			);
		} catch (error) {
			setStatus(formatError(error));
		}
	};

	const callPlugin = async (
		exportName: string,
		input = new Uint8Array(),
		timeoutMs?: number,
	) => {
		const runtime = runtimeRef.current;
		if (!runtime || !wasm) {
			setStatus("请先加载插件");
			return;
		}
		setBusy(true);
		try {
			const result = await runtime.call(exportName, input, { timeoutMs });
			setOutput(new TextDecoder().decode(result));
			setStatus(`${exportName} 调用成功`);
		} catch (error) {
			setStatus(formatError(error));
		} finally {
			refreshMetrics();
			setBusy(false);
		}
	};

	const runRoundtrip = () =>
		callPlugin("echo_json", new TextEncoder().encode(SAMPLE_INPUT));

	const runTimeout = () => callPlugin("hang", new Uint8Array(), 500);

	const runCrash = () => callPlugin("crash");

	const runLargePayload = () =>
		callPlugin("echo_json", new Uint8Array(8 * 1024 * 1024));

	const runTerminate = () => {
		const runtime = runtimeRef.current;
		if (!runtime || !wasm) {
			setStatus("请先加载插件");
			return;
		}
		runtime.terminate();
		setStatus("Worker 已显式终止；请点击 JSON roundtrip 验证自动恢复");
		refreshMetrics();
	};

	const runEmptyCallBenchmark = async () => {
		const runtime = runtimeRef.current;
		if (!runtime || !wasm) {
			setStatus("请先加载插件");
			return;
		}
		setBusy(true);
		try {
			const input = new Uint8Array();
			for (let index = 0; index < 10; index += 1) {
				await runtime.call("echo_json", input);
			}
			const samples: number[] = [];
			for (let index = 0; index < 1000; index += 1) {
				const startedAt = performance.now();
				await runtime.call("echo_json", input);
				samples.push(performance.now() - startedAt);
			}
			const summary = summarizeDurations(samples);
			setOutput(
				`空调用 ${summary.count} 次：p50=${summary.p50Ms.toFixed(2)} ms，p95=${summary.p95Ms.toFixed(2)} ms，平均=${summary.meanMs.toFixed(2)} ms，最大=${summary.maxMs.toFixed(2)} ms`,
			);
			setStatus("空调用基准完成");
		} catch (error) {
			setStatus(formatError(error));
		} finally {
			refreshMetrics();
			setBusy(false);
		}
	};

	const runOneMiBBenchmark = async () => {
		const runtime = runtimeRef.current;
		if (!runtime || !wasm) {
			setStatus("请先加载插件");
			return;
		}
		setBusy(true);
		try {
			const document = createJsonPayload(1024 * 1024);
			const startedAt = performance.now();
			const json = JSON.stringify(document);
			const input = new TextEncoder().encode(json);
			const result = await runtime.call("echo_json", input);
			const outputDocument = JSON.parse(new TextDecoder().decode(result));
			const durationMs = performance.now() - startedAt;
			if (JSON.stringify(outputDocument) !== json) {
				throw new Error("1 MiB JSON roundtrip output does not match input");
			}
			setOutput(
				`1 MiB JSON 序列化 + 往返成功：${input.byteLength} B，${durationMs.toFixed(2)} ms`,
			);
			setStatus("1 MiB JSON 基准完成");
		} catch (error) {
			setStatus(formatError(error));
		} finally {
			refreshMetrics();
			setBusy(false);
		}
	};

	const runMemoryBenchmark = async () => {
		if (!wasm) {
			setStatus("请先加载插件");
			return;
		}
		const beforeBytes = getUsedHeapSize();
		if (beforeBytes === null) {
			setStatus("当前 WebView 未提供 performance.memory，无法测量 JS heap");
			return;
		}
		setBusy(true);
		const runtimes: ExtismWorkerRuntime[] = [];
		try {
			for (let index = 0; index < 10; index += 1) {
				const runtime = new ExtismWorkerRuntime({ timeoutMs: 5000 });
				await runtime.load(wasm, { useWasi: wasmUseWasi });
				runtimes.push(runtime);
			}
			await new Promise((resolve) => requestAnimationFrame(resolve));
			const afterBytes = getUsedHeapSize();
			if (afterBytes === null) {
				setStatus("内存 API 在测试过程中不可用");
				return;
			}
			const deltaBytes = afterBytes - beforeBytes;
			setOutput(
				`10 个独立 Runtime：JS heap 增量 ${formatBytes(deltaBytes)}，平均 ${formatBytes(deltaBytes / 10)} / 插件；不含 Worker 原生内存`,
			);
			setStatus("多 Runtime 内存基准完成");
		} catch (error) {
			setStatus(formatError(error));
		} finally {
			await Promise.all(runtimes.map((runtime) => runtime.close()));
			refreshMetrics();
			setBusy(false);
		}
	};

	const runRepeatedLoad = async () => {
		const runtime = runtimeRef.current;
		if (!runtime || !wasm) {
			setStatus("请先加载插件");
			return;
		}
		setBusy(true);
		try {
			for (let index = 0; index < 20; index += 1) {
				await runtime.load(wasm, { useWasi: wasmUseWasi });
			}
			setStatus("已完成重复加载 20 次");
		} catch (error) {
			setStatus(formatError(error));
		} finally {
			refreshMetrics();
			setBusy(false);
		}
	};

	return (
		<Theme
			appearance={
				window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light"
			}
			panelBackground="solid"
		>
			<Dialog.Root open={open} onOpenChange={setOpen}>
				<Dialog.Content maxWidth="720px">
					<Dialog.Title>插件运行时诊断</Dialog.Title>
					<Flex direction="column" gap="3">
						<Flex gap="2" wrap="wrap">
							<Button onClick={loadSample} disabled={busy}>
								加载示例插件
							</Button>
							<Button onClick={() => loadPdkSample("rust")} disabled={busy}>
								加载 Rust PDK
							</Button>
							<Button onClick={() => loadPdkSample("csharp")} disabled={busy}>
								加载 C# PDK（WASI）
							</Button>
							<label>
								<Button asChild disabled={busy}>
									<span>选择 WASM</span>
								</Button>
								<input
									type="file"
									accept=".wasm,application/wasm,application/octet-stream"
									style={{ display: "none" }}
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (!file) return;
										void file
											.arrayBuffer()
											.then((bytes) =>
												loadBytes(
													new Uint8Array(bytes),
													file.name,
													wasmLoadMode,
												),
											);
									}}
								/>
							</label>
							<Select.Root
								value={wasmLoadMode}
								onValueChange={(value) =>
									setWasmLoadMode(value as WasmLoadMode)
								}
							>
								<Select.Trigger aria-label="WASI 加载模式" />
								<Select.Content>
									<Select.Item value="auto">自动检测 WASI</Select.Item>
									<Select.Item value="disabled">关闭 WASI</Select.Item>
									<Select.Item value="enabled">启用 WASI</Select.Item>
								</Select.Content>
							</Select.Root>
						</Flex>
						<Text size="2">
							插件：{wasmLabel}，WASI={String(wasmUseWasi)}
						</Text>
						<Text size="2" color={status.includes("成功") ? "green" : "gray"}>
							状态：{status}
						</Text>
						<Flex gap="2" wrap="wrap">
							<Button onClick={runRoundtrip} disabled={busy || !wasm}>
								JSON roundtrip
							</Button>
							<Button onClick={runTimeout} disabled={busy || !wasm}>
								超时 / 终止
							</Button>
							<Button onClick={runTerminate} disabled={busy || !wasm}>
								显式终止
							</Button>
							<Button onClick={runCrash} disabled={busy || !wasm}>
								插件崩溃
							</Button>
							<Button onClick={runLargePayload} disabled={busy || !wasm}>
								8 MiB payload
							</Button>
							<Button onClick={runRepeatedLoad} disabled={busy || !wasm}>
								重复加载 20 次
							</Button>
							<Button onClick={runEmptyCallBenchmark} disabled={busy || !wasm}>
								空调用 ×1000
							</Button>
							<Button onClick={runOneMiBBenchmark} disabled={busy || !wasm}>
								1 MiB JSON 往返
							</Button>
							<Button onClick={runMemoryBenchmark} disabled={busy || !wasm}>
								10 Runtime 内存
							</Button>
						</Flex>
						{output && (
							<TextArea
								readOnly
								value={output}
								rows={5}
								aria-label="插件输出"
							/>
						)}
						<ScrollArea
							type="auto"
							scrollbars="vertical"
							style={{ maxHeight: 160 }}
						>
							<TextArea
								readOnly
								value={formatMetrics(metrics)}
								rows={5}
								aria-label="运行时指标"
							/>
						</ScrollArea>
						<Text size="1" color="gray">
							crossOriginIsolated={String(window.crossOriginIsolated)}，Tauri=
							{String(Boolean(import.meta.env.TAURI_ENV_PLATFORM))}
						</Text>
					</Flex>
				</Dialog.Content>
			</Dialog.Root>
		</Theme>
	);
}
