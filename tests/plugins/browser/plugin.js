import { createElement as h, useState, useEffect } from "react";

export function activate({ host, pluginId }) {
	function View() {
		const [selection, setSelection] = useState(host.selection.get());
		const [result, setResult] = useState("未请求");
		const [count, setCount] = useState(0);
		useEffect(() => {
			const subscription = host.selection.onChanged(setSelection);
			void host.storage.kv
				.get("count")
				.then((value) => setCount(Number(value ?? 0)));
			return () => subscription.dispose();
		}, []);
		return h(
			"div",
			null,
			h("p", null, `项目文件：${host.project.getInfo().fileName}`),
			h("p", null, `选择：${selection.lineIds.join(",") || "空"}`),
			h("p", null, `保存计数：${count}`),
			h(
				"button",
				{
					onClick: async () => {
						await host.storage.kv.set("count", count + 1);
						setCount(count + 1);
					},
				},
				"保存计数",
			),
			h(
				"button",
				{
					onClick: async () => {
						const response = await host.network.request({
							url: `${location.origin}/tests/plugins/browser/network.json`,
						});
						setResult(
							response.ok
								? `HTTP ${response.value.status}`
								: response.error.code,
						);
					},
				},
				"请求本地夹具",
			),
			h("p", { role: "status" }, result),
			h(
				"button",
				{ onClick: () => host.ui.closeView(`${pluginId}.dialog`) },
				"关闭插件对话框",
			),
		);
	}
	host.views.registerView({
		id: `${pluginId}.dialog`,
		kind: "dialog-view",
		title: "浏览器验收对话框",
		view: View,
	});
	host.views.registerView({
		id: `${pluginId}.settings`,
		kind: "settings-view",
		title: "浏览器验收设置",
		view: View,
	});
	host.commands.register({
		id: `${pluginId}.open`,
		title: "浏览器验收：打开对话框",
		handler: () => host.ui.openView(`${pluginId}.dialog`),
	});
	host.menus.register({ menu: "menu.tool", command: `${pluginId}.open` });
	host.commands.register({
		id: `${pluginId}.edit`,
		title: "浏览器验收：元数据事务",
		handler: async () => {
			const result = await host.ui.showForm({
				title: "浏览器验收事务",
				fields: [
					{
						kind: "text",
						key: "title",
						label: "标题",
						default: "Browser smoke",
					},
				],
			});
			if (!result.submitted) return;
			const edit = host.document.applyEdit(
				[
					{
						op: "setMetadata",
						entries: [{ key: "title", values: [String(result.values.title)] }],
					},
				],
				"Browser smoke metadata",
			);
			host.ui.notify({
				level: edit.ok ? "success" : "error",
				message: edit.ok ? "浏览器验收事务成功" : edit.error.message,
			});
		},
	});
	host.menus.register({ menu: "menu.tool", command: `${pluginId}.edit` });
}
