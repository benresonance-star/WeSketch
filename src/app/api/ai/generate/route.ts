import { Buffer } from "node:buffer";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type UserContent } from "ai";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type {
  ImageGenerationQuality,
  ImageGenerationSize,
} from "@/types/canvas";

export const maxDuration = 120;

const PROMPT_VERSION = "image-generation-v1";
const MAX_PROMPT_LENGTH = 4_000;

type GenerateRequest = {
  projectId?: string;
  canvasId?: string;
  selectionId?: string;
  contextSnapshotId?: string;
  conversationId?: string;
  prompt?: string;
  includeNeighbourhood?: boolean;
  includeCanvas?: boolean;
  imageQuality?: ImageGenerationQuality;
  imageSize?: ImageGenerationSize;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const prompt = body.prompt?.trim();

  if (
    !body.projectId ||
    !body.canvasId ||
    !body.selectionId ||
    !body.contextSnapshotId ||
    !prompt
  ) {
    return NextResponse.json({ error: "Complete generation context is required." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: "The prompt is too long." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_CHAT_MODEL;
  const imageQuality: ImageGenerationQuality = ["low", "medium", "high"].includes(
    body.imageQuality ?? "",
  )
    ? body.imageQuality!
    : "low";
  const imageSize: ImageGenerationSize = [
    "1024x1024",
    "1536x1024",
    "1024x1536",
  ].includes(body.imageSize ?? "")
    ? body.imageSize!
    : "1024x1024";
  if (!apiKey || !modelName) {
    return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: contextSnapshot } = await supabase
    .from("context_snapshots")
    .select(
      "selection_id, canvas_id, selection_asset_path, neighbourhood_asset_path, canvas_asset_path",
    )
    .eq("id", body.contextSnapshotId)
    .eq("selection_id", body.selectionId)
    .eq("canvas_id", body.canvasId)
    .single();
  if (!contextSnapshot) {
    return NextResponse.json({ error: "Context snapshot was not found." }, { status: 404 });
  }

  let conversationId = body.conversationId;
  if (conversationId) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("project_id", body.projectId)
      .eq("canvas_id", body.canvasId)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
    }
  } else {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        project_id: body.projectId,
        canvas_id: body.canvasId,
        user_id: userId,
        root_selection_id: body.selectionId,
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create conversation." },
        { status: 500 },
      );
    }
    conversationId = created.id;
  }
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation could not be resolved." }, { status: 500 });
  }

  const { data: userMessage, error: userMessageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: prompt,
      selection_id: body.selectionId,
    })
    .select("id")
    .single();
  if (userMessageError || !userMessage) {
    return NextResponse.json({ error: "Could not save generation prompt." }, { status: 500 });
  }

  const { data: aiRun, error: runError } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId,
      project_id: body.projectId,
      conversation_id: conversationId,
      selection_id: body.selectionId,
      context_snapshot_id: body.contextSnapshotId,
      provider: "openai",
      model: modelName,
      action: "generate",
      status: "running",
      prompt_version: PROMPT_VERSION,
      request_metadata: {
        image_quality: imageQuality,
        image_size: imageSize,
        included_images: [
          "selection",
          ...(body.includeNeighbourhood ? ["neighbourhood"] : []),
          ...(body.includeCanvas ? ["canvas"] : []),
        ],
      },
    })
    .select("id")
    .single();
  if (runError || !aiRun) {
    return NextResponse.json({ error: "Could not create image generation run." }, { status: 500 });
  }

  const requestedImages = [
    { label: "SELECTION", path: contextSnapshot.selection_asset_path },
    ...(body.includeNeighbourhood
      ? [{ label: "LOCAL CONTEXT", path: contextSnapshot.neighbourhood_asset_path }]
      : []),
    ...(body.includeCanvas
      ? [{ label: "WHOLE CANVAS", path: contextSnapshot.canvas_asset_path }]
      : []),
  ];

  try {
    const downloads = await Promise.all(
      requestedImages.map(({ path }) =>
        supabase.storage.from("project-assets").download(path),
      ),
    );
    const downloadError = downloads.find(({ error }) => error)?.error;
    if (downloadError || downloads.some(({ data }) => !data)) {
      throw new Error(downloadError?.message ?? "Context image download failed.");
    }

    const imageData = await Promise.all(
      downloads.map(async ({ data }) => new Uint8Array(await data!.arrayBuffer())),
    );
    const content: UserContent = [
      {
        type: "text",
        text: `Generate one useful visual design alternative. ${prompt}`,
      },
    ];
    requestedImages.forEach(({ label }, index) => {
      content.push({ type: "text", text: label });
      content.push({
        type: "image",
        image: imageData[index],
        mediaType: "image/webp",
      });
    });

    const openai = createOpenAI({ apiKey });
    const result = await generateText({
      abortSignal: request.signal,
      model: openai(modelName),
      messages: [{ role: "user", content }],
      tools: {
        image_generation: openai.tools.imageGeneration({
          outputFormat: "webp",
          quality: imageQuality,
          size: imageSize,
        }),
      },
      toolChoice: { type: "tool", toolName: "image_generation" },
    });
    const imageResult = result.staticToolResults.find(
      (toolResult) => toolResult.toolName === "image_generation",
    );
    const output = imageResult?.output as { result?: string } | undefined;
    const imageBase64 = output?.result;
    if (!imageBase64) {
      throw new Error("OpenAI returned no generated image.");
    }

    const storagePath = `${userId}/${body.projectId}/generated/${aiRun.id}.webp`;
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const { error: uploadError } = await supabase.storage
      .from("project-assets")
      .upload(storagePath, imageBuffer, {
        contentType: "image/webp",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: artifact, error: artifactError } = await supabase
      .from("artifacts")
      .insert({
        project_id: body.projectId,
        canvas_id: body.canvasId,
        user_id: userId,
        artifact_type: "generated_image",
        storage_path: storagePath,
        mime_type: "image/webp",
        source_ai_run_id: aiRun.id,
        metadata: { prompt },
      })
      .select("id")
      .single();
    if (artifactError || !artifact) {
      await supabase.storage.from("project-assets").remove([storagePath]);
      throw new Error(artifactError?.message ?? "Could not save generated artifact.");
    }

    const assistantText = result.text.trim() || "Generated one visual alternative.";
    const { data: assistantMessage } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: null,
        role: "assistant",
        content: assistantText,
        selection_id: body.selectionId,
        ai_run_id: aiRun.id,
        parent_message_id: userMessage.id,
      })
      .select("id")
      .single();
    await supabase
      .from("ai_runs")
      .update({
        status: "completed",
        input_tokens: result.totalUsage.inputTokens,
        output_tokens: result.totalUsage.outputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", aiRun.id);
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({
      conversationId,
      messageId: assistantMessage?.id,
      artifactId: artifact.id,
      storagePath,
      imageBase64,
      text: assistantText,
    });
  } catch (error) {
    const cancelled = request.signal.aborted;
    const message = cancelled
      ? "Cancelled by user."
      : error instanceof Error
        ? error.message
        : "Image generation failed.";
    await supabase
      .from("ai_runs")
      .update({
        status: cancelled ? "cancelled" : "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", aiRun.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
