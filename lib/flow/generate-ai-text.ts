import type { GenerateTextNode } from "@/components/flow/generate-text-node";
import type { Model } from "@/components/ui/model-selector";
import { deepseek } from "@ai-sdk/deepseek";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";

interface ToolResult {
	id: string;
	name: string;
	result: string;
}

function createAIClient(model: Model) {
	switch (model) {
		case "deepseek-chat":
			return deepseek;
		case "llama-3.3-70b-versatile":
		case "llama-3.1-8b-instant":
		case "deepseek-r1-distill-llama-70b":
			return groq;
		case "gpt-4o":
		case "gpt-4o-mini":
			return openai;
		default:
			throw new Error(`Unsupported model: ${model}`);
	}
}

function mapToolsForAI(
	tools: GenerateTextNode["data"]["dynamicHandles"]["tools"],
) {
	return Object.fromEntries(
		tools.map((toolToMap) => [
			toolToMap.name,
			{
				description: toolToMap.description,
				parameters: z.object({
					toolValue: z.string(),
				}),
				execute: async ({ toolValue }: { toolValue: string }) => toolValue,
			},
		]),
	);
}

export async function generateAIText({
	prompt,
	system,
	model,
	tools,
}: {
	prompt: string;
	system?: string;
	model: Model;
	tools: GenerateTextNode["data"]["dynamicHandles"]["tools"];
}) {
	const client = createAIClient(model);
	const mappedTools = mapToolsForAI(tools);

	const result = await generateText({
		model: client(model),
		system,
		prompt,
		...(tools.length > 0 && {
			tools: mappedTools,
			maxSteps: 1,
			toolChoice: "required",
		}),
	});

	let toolResults: ToolResult[] = [];
	if (tools.length > 0 && result.toolResults) {
		toolResults = result.toolResults.map((step) => {
			const originalTool = tools.find((tool) => tool.name === step.toolName);
			return {
				id: originalTool?.id || "",
				name: step.toolName,
				description: originalTool?.description || "",
				result: step.result,
			};
		});
	}

	const parsedResult: Record<string, string> = {
		result: result.text,
	};

	for (const toolResult of toolResults) {
		parsedResult[toolResult.id] = toolResult.result;
	}

	return {
		text: result.text,
		toolResults,
		totalTokens: result.usage?.totalTokens,
		parsedResult,
	};
}
