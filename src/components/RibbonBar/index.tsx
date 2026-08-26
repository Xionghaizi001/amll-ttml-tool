/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/amll-dev/amll-ttml-tool/blob/main/LICENSE
 */

import { Card, Inset } from "@radix-ui/themes";
import { AnimatePresence } from "framer-motion";
import { useAtomValue } from "jotai";
import { forwardRef, memo } from "react";
import SuspensePlaceHolder from "$/components/SuspensePlaceHolder";
import { useActiveMode } from "$/plugins/ui/mode-host";
import { toolModeAtom } from "$/states/main.ts";

export const RibbonBar = memo(
	forwardRef<HTMLDivElement>((_props, ref) => {
		const toolMode = useAtomValue(toolModeAtom);
		const { activeMode } = useActiveMode(toolMode);
		const RibbonView = activeMode?.ribbonView;

		return (
			<Card
				m="2"
				mb="0"
				data-slot="ribbon-bar"
				style={{
					minHeight: "fit-content",
					flexShrink: "0",
				}}
				ref={ref}
			>
				<Inset>
					<div
						style={{
							height: "130px",
							overflowY: "clip",
						}}
					>
						<AnimatePresence mode="wait">
							{RibbonView && (
								<SuspensePlaceHolder key={activeMode.modeId}>
									<RibbonView />
								</SuspensePlaceHolder>
							)}
						</AnimatePresence>
					</div>
				</Inset>
			</Card>
		);
	}),
);

export default RibbonBar;
