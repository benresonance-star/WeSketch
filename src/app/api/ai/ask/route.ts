import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage, type UserContent } from "ai";
import { NextResponse } from "next/server";

import { assertOwnedCanvasAccess } from "@/lib/supabase/access-control";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const PROMPT_VERSION = "design-partner-v1";
const MAX_PROMPT_LENGTH = 4_000;
const SYSTEM_PROMPT = `You are a collaborative visual design partner.
The user has selected a particular region of a larger visual canvas.
You receive a SELECTION image and may also receive labelled LOCAL CONTEXT and WHOLE CANVAS images.
Treat the selection as the primary subject and the other images as context.
Do not pretend uncertain sketch content is certain. State observations as observations.
Be concise and useful, normally offering one to four concrete ideas.
This Ask action returns text only. Do not claim to have generated, created, or attached an image.`;

type AskRequest = {
  projectId?: string;
  canvasId?: string;
  selectionId?: string;
  contextSnapshotId?: string;
  conversationId?: string;
  prompt?: string;
  includeNeighbourhood?: boolean;
  includeCanvas?: boolean;
};

function invalidRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const body = (await request.json()) as AskRequest;
  const prompt = body.prompt?.trim();

  if (
    !body.projectId ||
    !body.canvasId ||
    !body.selectionId ||
    !body.contextSnapshotId ||
    !prompt
  ) {
    return invalidRequest("Project, canvas, selection, context, and prompt are required.");
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return invalidRequest(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_CHAT_MODEL;

  if (!apiKey || !modelName) {
    return NextResponse.json(
      { error: "AI service environment variables are not configured." },
      { status: 503 },
    );
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

  const { data: contextSnapshot, error: contextError } = await supabase
    .from("context_snapshots")
    .select(
      "id, selection_id, canvas_id, selection_asset_path, neighbourhood_asset_path, canvas_asset_path",
    )
    .eq("id", body.contextSnapshotId)
    .eq("selection_id", body.selectionId)
    .eq("canvas_id", body.canvasId)
    .single();

  if (contextError || !contextSnapshot) {
    return NextResponse.json({ error: "Context snapshot was not found." }, { status: 404 });
  }

  let conversationId = body.conversationId;

  if (conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("project_id", body.projectId)
      .eq("canvas_id", body.canvasId)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
    }
  } else {
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        project_id: body.projectId,
        canvas_id: body.canvasId,
        user_id: userId,
        root_selection_id: body.selectionId,
      })
      .select("id")
      .single();

    if (error || !conversation) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create conversation." },
        { status: 500 },
      );
    }
    conversationId = conversation.id;
  }

  if (!conversationId) {
    return NextResponse.json({ error: "Conversation could not be resolved." }, { status: 500 });
  }
  const activeConversationId = conversationId;

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  const { data: userMessage, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: activeConversationId,
      user_id: userId,
      role: "user",
      content: prompt,
      selection_id: body.selectionId,
    })
    .select("id")
    .single();

  if (messageError || !userMessage) {
    return NextResponse.json(
      { error: messageError?.message ?? "Could not save the prompt." },
      { status: 500 },
    );
  }

  const { data: aiRun, error: runError } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId,
      project_id: body.projectId,
      conversation_id: activeConversationId,
      selection_id: body.selectionId,
      context_snapshot_id: body.contextSnapshotId,
      provider: "openai",
      model: modelName,
      action: "ask",
      status: "running",
      prompt_version: PROMPT_VERSION,
      request_metadata: {
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
    return NextResponse.json(
      { error: runError?.message ?? "Could not create the AI request." },
      { status: 500 },
    );
  }

  const requestedImages = [
    { label: "SELECTION", path: contextSnapshot.selection_asset_path },
    ...(body.includeNeighbourhood
      ? [
          {
            label: "LOCAL CONTEXT",
            path: contextSnapshot.neighbourhood_asset_path,
          },
        ]
      : []),
    ...(body.includeCanvas
      ? [{ label: "WHOLE CANVAS", path: contextSnapshot.canvas_asset_path }]
      : []),
  ];
  const downloads = await Promise.all(
    requestedImages.map(({ path }) =>
      supabase.storage.from("project-assets").download(path),
    ),
  );
  const downloadError = downloads.find(({ error }) => error)?.error;

  if (downloadError || downloads.some(({ data }) => !data)) {
    await supabase
      .from("ai_runs")
      .update({
        status: "failed",
        error_message: downloadError?.message ?? "Context image download failed.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", aiRun.id);
    return NextResponse.json({ error: "Could not load private context images." }, { status: 500 });
  }

  const imageData = await Promise.all(
    downloads.map(async ({ data }) => new Uint8Array(await data!.arrayBuffer())),
  );
  const priorMessages: ModelMessage[] = (history ?? []).map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
  }));
  const userContent: UserContent = [{ type: "text", text: prompt }];
  requestedImages.forEach(({ label }, index) => {
    userContent.push({ type: "text", text: label });
    userContent.push({
      type: "image",
      image: imageData[index],
      mediaType: "image/webp",
    });
  });
  const openai = createOpenAI({ apiKey });
  const result = streamText({
    model: openai(modelName),
    system: SYSTEM_PROMPT,
    messages: [
      ...priorMessages,
      {
        role: "user",
        content: userContent,
      },
    ],
    onError: async ({ error }) => {
      await supabase
        .from("ai_runs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "AI stream failed.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", aiRun.id);
    },
    onFinish: async ({ text, totalUsage }) => {
      await supabase.from("messages").insert({
        conversation_id: activeConversationId,
        user_id: null,
        role: "assistant",
        content: text,
        selection_id: body.selectionId,
        ai_run_id: aiRun.id,
        parent_message_id: userMessage.id,
      });
      await supabase
        .from("ai_runs")
        .update({
          status: "completed",
          input_tokens: totalUsage.inputTokens,
          output_tokens: totalUsage.outputTokens,
          completed_at: new Date().toISOString(),
        })
        .eq("id", aiRun.id);
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeConversationId);
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "x-ai-run-id": aiRun.id,
      "x-conversation-id": activeConversationId,
    },
  });
}
