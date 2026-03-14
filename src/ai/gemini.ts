import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface EmailClassification {
  folder: string;
  reason: string;
  priority: "High" | "Medium" | "Low";
  suggestedAction: string;
}

export interface AgentDecision {
  action: string;
  target?: string;
  params?: Record<string, any>;
  reasoning: string;
}

export async function classifyEmail(
  from: string,
  subject: string,
  bodyPreview: string
): Promise<EmailClassification> {
  const prompt = `
    Classify this email into one of these folders:
    - Inbox (default/general)
    - Students_Queries: Student emails needing response
    - Admin_Management: Management, admin, circulars
    - Deadlines_Alerts: Time-critical items
    - Other_To_Review: Not urgent, needs thinking
    - Events_Training: Events, webinars, training

    Email Details:
    From: ${from}
    Subject: ${subject}
    Preview: ${bodyPreview}

    Return the classification in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            folder: { type: Type.STRING },
            reason: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
            suggestedAction: { type: Type.STRING },
          },
          required: ["folder", "reason", "priority", "suggestedAction"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Classification error:", error);
    return {
      folder: "Other_To_Review",
      reason: "Error during classification",
      priority: "Low",
      suggestedAction: "Review manually",
    };
  }
}

export async function generateDraft(
  from: string,
  subject: string,
  bodyContent: string
): Promise<string> {
  const prompt = `
    Write a professional draft reply to this email. Be direct, concise, and professional.
    Do NOT use placeholder brackets like [Date] or [Name].
    This is a DRAFT only - the human will review and send it.

    Email to reply to:
    From: ${from}
    Subject: ${subject}
    Content: ${bodyContent}

    Draft Reply:
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { temperature: 0.3 },
    });
    return response.text || "Could not generate draft.";
  } catch (error) {
    console.error("Draft generation error:", error);
    return "Error generating draft.";
  }
}

export async function summarizeEmails(
  emails: { from: string; subject: string; preview: string }[]
): Promise<string> {
  const emailList = emails
    .map((e, i) => `${i + 1}. From: ${e.from} | Subject: ${e.subject} | Preview: ${e.preview}`)
    .join("\n");

  const prompt = `
    Summarize these emails concisely. For each, give: priority level (High/Medium/Low),
    one-line summary, and whether it needs a reply.

    Emails:
    ${emailList}

    Provide a brief, actionable summary.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    return response.text || "Could not summarize.";
  } catch (error) {
    console.error("Summarization error:", error);
    return "Error summarizing emails.";
  }
}

export async function decideNextAction(
  currentState: string,
  goal: string,
  history: string[]
): Promise<AgentDecision> {
  const historyText =
    history.length > 0 ? `Recent actions:\n${history.slice(-10).join("\n")}` : "No previous actions.";

  const prompt = `
    You are an AI agent controlling an Outlook email browser session.
    
    Current state of the page:
    ${currentState}
    
    User's goal:
    ${goal}
    
    ${historyText}
    
    Available actions:
    - navigate_to_outlook: Go to Outlook inbox
    - get_email_list: Read the list of visible emails
    - open_email(index): Open a specific email by index number
    - read_email: Read the currently open email
    - compose_email(to, subject, body): Start composing a new email
    - reply_to_email(body): Reply to the currently open email
    - send_email: Send the composed/reply email
    - scroll_down: Scroll the email list down
    - scroll_up: Scroll the email list up
    - navigate_to_folder(name): Navigate to a specific folder
    - search_emails(query): Search for emails
    - move_to_folder(name): Move selected email to folder
    - delete_email: Delete selected email
    - mark_as_read: Mark selected email as read
    - classify_email: Use AI to classify the current email
    - generate_draft: Use AI to draft a reply to the current email
    - summarize_inbox: Summarize visible emails
    - done: The goal has been achieved
    - wait: Wait and observe (no action needed right now)
    
    Decide the single best next action to achieve the goal.
    Return JSON with: action, target (optional), params (optional object), reasoning.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING },
            target: { type: Type.STRING },
            params: { type: Type.OBJECT, properties: {} },
            reasoning: { type: Type.STRING },
          },
          required: ["action", "reasoning"],
        },
      },
    });
    return JSON.parse(response.text || '{"action":"wait","reasoning":"Parse error"}');
  } catch (error) {
    console.error("Agent decision error:", error);
    return { action: "wait", reasoning: "Error in decision making" };
  }
}
