import type {
	FormFieldV0,
	FormResultV0,
	FormValueV0,
	LocalizedText,
} from "@amll-ttml-tool/plugin-api";
import {
	Button,
	Checkbox,
	Dialog,
	Flex,
	IconButton,
	RadioGroup,
	Select,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { declarativeFormService } from "./declarative-form-service";
import { FluentFormIcon } from "./fluent-form-icons";
import {
	clampFormNumber,
	collectFormDefaultValues,
	isFormValid,
	matchesFormCondition,
	sanitizeFormValues,
} from "./form-model";

const localize = (text: LocalizedText, locale: string): string => {
	if (typeof text === "string") return text;
	return text[locale] ?? text[locale.split("-")[0]] ?? text.default;
};

const formWidths = { small: "450px", medium: "560px", large: "720px" } as const;
const formGaps = { small: "2", medium: "3", large: "4" } as const;

export const DeclarativeFormHost = () => {
	const { i18n, t } = useTranslation();
	const request = useSyncExternalStore(
		declarativeFormService.subscribe,
		declarativeFormService.getSnapshot,
		() => null,
	);
	const [values, setValues] = useState<Record<string, FormValueV0>>({});

	useEffect(() => {
		setValues(request ? collectFormDefaultValues(request.schema.fields) : {});
	}, [request]);

	if (!request) return null;
	const { schema } = request;
	const setValue = (key: string, value: FormValueV0) =>
		setValues((current) => ({ ...current, [key]: value }));
	const renderFields = (fields: readonly FormFieldV0[]) =>
		fields.map((field, fieldIndex) => {
			if (!matchesFormCondition(field.visibleWhen, values)) return null;
			if (field.kind === "group") {
				return (
					<Flex key={field.id} direction="column" gap="1">
						{(field.label || field.icon) && (
							<Flex align="center" gap="1">
								<FluentFormIcon icon={field.icon} />
								{field.label && (
									<Text size="2" weight="bold">
										{localize(field.label, i18n.language)}
									</Text>
								)}
							</Flex>
						)}
						<Flex
							ml={field.indent ? "4" : undefined}
							direction={field.direction ?? "column"}
							align={field.align}
							gap={formGaps[field.gap ?? "small"]}
						>
							{renderFields(field.fields)}
						</Flex>
					</Flex>
				);
			}
			if (field.kind === "note")
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: the schema is immutable for the lifetime of a form request, so positions are stable
					<Flex key={`note-${fieldIndex}`} align="center" gap="1">
						<FluentFormIcon icon={field.icon} />
						<Text
							size="2"
							color={field.tone === "default" ? undefined : "gray"}
						>
							{localize(field.text, i18n.language)}
						</Text>
					</Flex>
				);
			const label = localize(field.label, i18n.language);
			const value = values[field.key];
			const controlSize = field.controlSize === "small" ? "1" : "2";
			const fieldStyle =
				field.width === "compact"
					? { width: "60px", flexShrink: 0 }
					: { flexGrow: 1 };
			return (
				<Flex key={field.key} direction="column" gap="1" style={fieldStyle}>
					{field.labelPlacement !== "hidden" && (
						<Flex align="center" gap="1">
							<FluentFormIcon icon={field.icon} />
							<Text size="2" weight="bold">
								{label}
							</Text>
						</Flex>
					)}
					{field.kind === "text" && field.multiline && (
						<TextArea
							size={controlSize}
							value={String(value ?? "")}
							placeholder={field.placeholder}
							maxLength={field.maxLength}
							required={field.required}
							onChange={(event) => setValue(field.key, event.target.value)}
						/>
					)}
					{field.kind === "text" && !field.multiline && (
						<TextField.Root
							size={controlSize}
							value={String(value ?? "")}
							placeholder={field.placeholder}
							maxLength={field.maxLength}
							required={field.required}
							onChange={(event) => setValue(field.key, event.target.value)}
						/>
					)}
					{field.kind === "number" && field.control !== "stepper" && (
						<TextField.Root
							size={controlSize}
							type="number"
							min={field.min}
							max={field.max}
							step={field.step}
							required={field.required}
							value={String(value ?? 0)}
							onChange={(event) =>
								setValue(field.key, Number(event.target.value))
							}
						/>
					)}
					{field.kind === "number" && field.control === "stepper" && (
						<Flex gap="2" align="center">
							<IconButton
								size={controlSize}
								variant="soft"
								title={`- ${field.step ?? 1}`}
								onClick={() =>
									setValue(
										field.key,
										clampFormNumber(
											Number(value ?? 0) - (field.step ?? 1),
											field.min,
											field.max,
										),
									)
								}
							>
								<FluentFormIcon
									icon={
										field.decrementIcon ?? {
											source: "@fluentui/react-icons",
											name: "ArrowLeftRegular",
										}
									}
								/>
							</IconButton>
							<TextField.Root
								size={controlSize}
								type="number"
								min={field.min}
								max={field.max}
								step={field.step}
								required={field.required}
								value={String(value ?? 0)}
								style={{ flexGrow: 1 }}
								onChange={(event) =>
									setValue(field.key, Number(event.target.value))
								}
							/>
							<IconButton
								size={controlSize}
								variant="soft"
								title={`+ ${field.step ?? 1}`}
								onClick={() =>
									setValue(
										field.key,
										clampFormNumber(
											Number(value ?? 0) + (field.step ?? 1),
											field.min,
											field.max,
										),
									)
								}
							>
								<FluentFormIcon
									icon={
										field.incrementIcon ?? {
											source: "@fluentui/react-icons",
											name: "ArrowRightRegular",
										}
									}
								/>
							</IconButton>
						</Flex>
					)}
					{field.kind === "boolean" && (
						<Checkbox
							checked={Boolean(value)}
							onCheckedChange={(checked) =>
								setValue(field.key, checked === true)
							}
						/>
					)}
					{field.kind === "select" && (
						<Select.Root
							value={String(value ?? "")}
							onValueChange={(next) => setValue(field.key, next)}
						>
							<Select.Trigger />
							<Select.Content>
								{field.options.map((option) => (
									<Select.Item
										key={option.value}
										value={option.value}
										disabled={option.disabled}
									>
										<Flex align="center" gap="1">
											<FluentFormIcon icon={option.icon} />
											{localize(option.label, i18n.language)}
										</Flex>
									</Select.Item>
								))}
							</Select.Content>
						</Select.Root>
					)}
					{field.kind === "radio" && (
						<RadioGroup.Root
							value={String(value ?? "")}
							onValueChange={(next) => setValue(field.key, next)}
							style={
								field.orientation === "horizontal"
									? { flexDirection: "row", gap: "16px" }
									: undefined
							}
						>
							{field.options.map((option) => (
								<RadioGroup.Item
									key={option.value}
									value={option.value}
									disabled={option.disabled}
								>
									<Flex align="center" gap="1">
										<FluentFormIcon icon={option.icon} />
										{localize(option.label, i18n.language)}
									</Flex>
								</RadioGroup.Item>
							))}
						</RadioGroup.Root>
					)}
				</Flex>
			);
		});

	// Custom footer actions take over the whole footer; the legacy pair keeps
	// resolving without an `action` id so existing callers see the same result.
	const footerActions = schema.actions?.map((action) => ({
		id: action.id as string | undefined,
		role: action.role ?? ("submit" as const),
		tone: action.tone ?? (action.role === "cancel" ? "neutral" : "primary"),
		icon: action.icon,
		label: localize(action.label, i18n.language),
	})) ?? [
		{
			id: undefined,
			role: "cancel" as const,
			tone: "neutral" as const,
			icon: schema.cancelIcon,
			label: schema.cancelLabel
				? localize(schema.cancelLabel, i18n.language)
				: t("common.cancel", "取消"),
		},
		{
			id: undefined,
			role: "submit" as const,
			tone: "primary" as const,
			icon: schema.submitIcon,
			label: schema.submitLabel
				? localize(schema.submitLabel, i18n.language)
				: t("common.apply", "应用"),
		},
	];

	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open) declarativeFormService.cancel(request.id);
			}}
		>
			<Dialog.Content maxWidth={formWidths[schema.size ?? "medium"]}>
				<Dialog.Title>
					<Flex align="center" gap="2">
						<FluentFormIcon icon={schema.icon} />
						{localize(schema.title, i18n.language)}
					</Flex>
				</Dialog.Title>
				{schema.description && (
					<Dialog.Description>
						{localize(schema.description, i18n.language)}
					</Dialog.Description>
				)}
				<Flex direction="column" gap="4" mt="4">
					{renderFields(schema.fields)}
				</Flex>
				<Flex gap="3" mt="5" justify="end">
					{footerActions.map((action, actionIndex) => (
						<Button
							key={action.id ?? `${action.role}-${actionIndex}`}
							variant={action.tone === "neutral" ? "soft" : "solid"}
							color={
								action.tone === "neutral"
									? "gray"
									: action.tone === "danger"
										? "red"
										: undefined
							}
							disabled={
								action.role === "submit" && !isFormValid(schema.fields, values)
							}
							onClick={() => {
								const result: FormResultV0 =
									action.role === "submit"
										? {
												submitted: true,
												...(action.id !== undefined && { action: action.id }),
												values: sanitizeFormValues(schema.fields, values),
											}
										: {
												submitted: false,
												...(action.id !== undefined && { action: action.id }),
											};
								declarativeFormService.complete(request.id, result);
							}}
						>
							<FluentFormIcon icon={action.icon} />
							{action.label}
						</Button>
					))}
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
