// Test-only Vite entry: real application, install gate, Blob loader and UI.
// Not imported by index.html or included in the production build.
import { strToU8, zipSync } from "fflate";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import code from "./plugin.js?raw";
import { installLocalPluginFile } from "$/plugins/ui/local-package-install";
import { installTrustedJsPackage } from "$/plugins/trusted/trusted-js-host";
import { pluginInstallationService } from "$/plugins/store/store-host";
import { globalStore } from "$/states/store";
import { selectedLinesAtom } from "$/states/main";
import { settingsDialogAtom, settingsTabAtom } from "$/states/dialogs";
import { pluginNetworkOfflineAtom } from "$/states/plugins";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document";

const id = "test.browser-migration";
const manifest = {
	id,
	name: "浏览器验收插件",
	version: "1.0.0",
	apiVersion: 0,
	kind: "function",
	runtime: "trusted-js",
	entry: "index.js",
	capabilities: [],
};
// Host-side stimuli remain available while a Radix modal owns focus.
const onKeyDown = (event: KeyboardEvent) => {
	if (!event.ctrlKey || !event.altKey) return;
	if (event.code === "KeyS")
		globalStore.set(selectedLinesAtom, ["browser-selection"]);
	if (event.code === "KeyD")
		void pluginInstallationService.setEnabled("function", id, false);
};
document.addEventListener("keydown", onKeyDown);
function Fixture() {
	const [status, setStatus] = useState("就绪");
	const run = (operation: () => unknown) => async () => {
		try {
			setStatus(JSON.stringify(await operation()) ?? "完成");
		} catch (error) {
			setStatus(String(error));
		}
	};
	return (
		<aside
			style={{
				position: "fixed",
				bottom: 0,
				left: 0,
				zIndex: 10,
				background: "white",
				color: "black",
				padding: 8,
			}}
		>
			<strong>测试控制台（仅测试入口）</strong>
			<span>模态框内：Ctrl+Alt+S 改变选择；Ctrl+Alt+D 禁用插件。</span>
			<button
				onClick={run(() =>
					installLocalPluginFile(
						new File(
							[
								zipSync({
									"manifest.json": strToU8(
										JSON.stringify({ packageVersion: 0, manifest }),
									),
									"assets/index.js": strToU8(code),
								}),
							],
							"browser-smoke.zip",
						),
					),
				)}
			>
				安装验收 ZIP
			</button>
			<button
				onClick={run(() =>
					installTrustedJsPackage({ packageVersion: 0, manifest, code }, "dev"),
				)}
			>
				加载 dev 副本
			</button>
			<button
				onClick={() => {
					globalStore.set(settingsTabAtom, "common");
					globalStore.set(settingsDialogAtom, true);
				}}
			>
				打开首选项
			</button>
			<button
				onClick={() => {
					globalStore.set(settingsTabAtom, `${id}.settings`);
					globalStore.set(settingsDialogAtom, true);
				}}
			>
				打开贡献视图（端口验收）
			</button>
			<button
				onClick={run(() =>
					pluginInstallationService.setEnabled("function", id, false),
				)}
			>
				禁用验收插件
			</button>
			<button
				onClick={run(() =>
					pluginInstallationService.setEnabled("function", id, true),
				)}
			>
				启用验收插件
			</button>
			<button
				onClick={() =>
					globalStore.set(selectedLinesAtom, ["browser-selection"])
				}
			>
				改变选择
			</button>
			<button
				onClick={() =>
					globalStore.set(
						pluginNetworkOfflineAtom,
						!globalStore.get(pluginNetworkOfflineAtom),
					)
				}
			>
				切换插件离线
			</button>
			<button
				onClick={run(() =>
					editorDocumentAdapter.undo({
						source: "user",
						label: "Browser smoke undo",
					}),
				)}
			>
				撤销验收事务
			</button>
			<button onClick={run(() => editorDocumentAdapter.service.readSnapshot())}>
				读取文档
			</button>
			<output
				style={{
					display: "block",
					maxHeight: 80,
					maxWidth: "90vw",
					overflow: "auto",
					overflowWrap: "anywhere",
				}}
			>
				{status}
			</output>
		</aside>
	);
}
const panel = document.createElement("div");
document.body.append(panel);
const root = createRoot(panel);
root.render(<Fixture />);
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		document.removeEventListener("keydown", onKeyDown);
		root.unmount();
		panel.remove();
	});
}
