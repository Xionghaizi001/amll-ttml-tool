/** @jsxRuntime classic */
import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
// biome-ignore lint/correctness/noUnusedImports: classic JSX runtime needs React in scope for IDE TypeScript.
import * as React from "react";
import { GithubLoginCard } from "$/modules/github/modals/GithubLoginCard";
import { LyricsSiteLoginCard } from "$/modules/lyrics-site/modals/LyricsSiteLoginCard";
import { NeteaseLoginCard } from "$/modules/ncm/modals/NeteaseLoginCard";
import { lyricsSiteUserAtom } from "$/modules/review/services/remote-service";
import { githubLoginAtom } from "$/modules/settings/states";

export const SettingsConnectTab = () => {
	const githubLogin = useAtomValue(githubLoginAtom);
	const lyricsSiteUser = useAtomValue(lyricsSiteUserAtom);
	const shouldShowNetease =
		Boolean(githubLogin.trim()) || Boolean(lyricsSiteUser);

	return (
		<Flex direction="column" gap="4">
			<GithubLoginCard />

			<LyricsSiteLoginCard />

			{shouldShowNetease && <NeteaseLoginCard />}
		</Flex>
	);
};
