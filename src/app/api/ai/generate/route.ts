import { Buffer } from "node:buffer";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type UserContent } from "ai";
import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  closestImageGenerationSize,
  isImageGenerationIntent,
  outputSizeForBounds,
} from "@/lib/canvas/generation";
import { assertOwnedCanvasAccess } from "@/lib/supabase/access-control";
import { createClient } from "@/lib/supabase/server";
import type {
  Bounds,
  GenerationPlacement,
  ImageGenerationIntent,
  ImageGenerationQuality,
  ImageGenerationSize,
} from "@/types/canvas";

export const maxDuration = 120;

const PROMPT_VERSION = "image-generation-v2";
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
  intent?: ImageGenerationIntent;
};

function parseBounds(value: unknown): Bounds | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<Bounds>;
  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return null;
  }
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
}

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
  if (body.intent !== undefined && !isImageGenerationIntent(body.intent)) {
    return NextResponse.json({ error: "Unknown generation intent." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_CHAT_MODEL;
  const intent = body.intent ?? "beside";
  const imageQuality: ImageGenerationQuality = ["low", "medium", "high"].includes(
    body.imageQuality ?? "",
  )
    ? body.imageQuality!
    : "low";
  const configuredImageSize: ImageGenerationSize = [
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

  const hasCanvasAccess = await assertOwnedCanvasAccess(
    supabase,
    userId,
    body.projectId,
    body.canvasId,
  );
  if (!hasCanvasAccess) {
    return NextResponse.json(
      { error: "Project or canvas was not found." },
      { status: 404 },
    );
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
  const { data: selection } = await supabase
    .from("selections")
    .select("selection_type, bounds")
    .eq("id", body.selectionId)
    .eq("canvas_id", body.canvasId)
    .single();
  const selectionBounds = parseBounds(selection?.bounds);
  if (!selection || !selectionBounds) {
    return NextResponse.json({ error: "Selection geometry was not found." }, { status: 404 });
  }
  if (intent === "in_place" && selection.selection_type !== "rectangle") {
    return NextResponse.json(
      { error: "In-place generation currently requires a rectangular selection." },
      { status: 400 },
    );
  }
  const imageSize =
    intent === "in_place"
      ? closestImageGenerationSize(selectionBounds)
      : configuredImageSize;
  const placement: GenerationPlacement = {
    mode: intent,
    ...selectionBounds,
  };

  let conversationId = body.conversationId;
  if (conversationId) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
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
      action: intent === "in_place" ? "transform" : "generate",
      status: "running",
      prompt_version: PROMPT_VERSION,
      request_metadata: {
        image_quality: imageQuality,
        image_size: imageSize,
        intent,
        placement,
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
        text:
          intent === "in_place"
            ? `Transform the selected visual into one coherent design alternative that will replace the exact selected rectangle. Treat visible sketch marks as intentional design direction, preserve the selection's composition and viewpoint, and fill the full frame without borders or captions. ${prompt}`
            : `Generate one useful visual design alternative. ${prompt}`,
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
    const generatedImageBuffer = Buffer.from(imageBase64, "base64");
    const targetSize =
      intent === "in_place"
        ? outputSizeForBounds(selectionBounds)
        : await sharp(generatedImageBuffer)
            .metadata()
            .then((metadata) => ({
              width: metadata.width ?? 1,
              height: metadata.height ?? 1,
            }));
    const imageBuffer =
      intent === "in_place"
        ? await sharp(generatedImageBuffer)
            .resize(targetSize.width, targetSize.height, {
              fit: "cover",
              position: "centre",
            })
            .webp({ quality: 90 })
            .toBuffer()
        : generatedImageBuffer;
    const responseImageBase64 = imageBuffer.toString("base64");
    const uploadBytes = Uint8Array.from(imageBuffer);
    const { error: uploadError } = await supabase.storage
      .from("project-assets")
      .upload(storagePath, uploadBytes.buffer, {
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
        width: targetSize.width,
        height: targetSize.height,
        source_ai_run_id: aiRun.id,
        metadata: { prompt, intent, placement },
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
        response_metadata: {
          artifact_id: artifact.id,
          placement,
          width: targetSize.width,
          height: targetSize.height,
        },
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
      imageBase64: responseImageBase64,
      text: assistantText,
      intent,
      placement,
      imageWidth: targetSize.width,
      imageHeight: targetSize.height,
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
