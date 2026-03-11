import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface EmailClassification {
  folder: string;
  reason: string;
  priority: "High" | "Medium" | "Low";
  suggestedAction: string;
}

export interface CaseAnalysis {
  caseTitle: string;
  status: string;
  keyDeadlines: string[];
  requiredActions: string[];
  evidenceExtracted: string[];
  aiRecommendation: string;
}

export async function analyzeCase(emails: any[], caseType: 'Extension' | 'Hearing'): Promise<CaseAnalysis> {
  const emailContext = emails.map(e => `From: ${e.from.emailAddress.name}\nSubject: ${e.subject}\nBody: ${e.bodyPreview}`).join('\n---\n');
  
  const prompt = `
    Perform a deep analysis of the following email thread related to a ${caseType} case at North-West University (NWU).
    
    Compliance & Protocol Requirements:
    - Adhere strictly to NWU Academic Rules and IT Policies.
    - Ensure POPIA (Protection of Personal Information Act) compliance: do not expose sensitive personal data unnecessarily.
    - Maintain professional academic standards.
    
    Context:
    User: Grantt Gouws
    Student Number: 22807365
    
    Emails:
    ${emailContext}
    
    Return a detailed analysis in JSON format including:
    - caseTitle: A professional title for the case.
    - status: Current status based on the latest email.
    - keyDeadlines: Any dates mentioned that require action.
    - requiredActions: Specific steps Grantt needs to take (e.g., fill Form 3.1, contact supervisor).
    - evidenceExtracted: Key facts or statements that support Grantt's position or explain the situation.
    - aiRecommendation: Strategic advice on how to handle this to ensure a positive outcome, aligned with NWU framework.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", // Use Pro for deep analysis
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caseTitle: { type: Type.STRING },
            status: { type: Type.STRING },
            keyDeadlines: { type: Type.ARRAY, items: { type: Type.STRING } },
            requiredActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            evidenceExtracted: { type: Type.ARRAY, items: { type: Type.STRING } },
            aiRecommendation: { type: Type.STRING },
          },
          required: ["caseTitle", "status", "keyDeadlines", "requiredActions", "evidenceExtracted", "aiRecommendation"],
        },
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Case analysis error:", error);
    return {
      caseTitle: `${caseType} Case Analysis`,
      status: "Analysis Failed",
      keyDeadlines: [],
      requiredActions: ["Manual review required"],
      evidenceExtracted: [],
      aiRecommendation: "Please review the emails manually as the AI analysis encountered an error.",
    };
  }
}
export interface ScoutResult {
  name: string;
  azureInfo: string;
  huggingFaceInfo: string;
  gitHubInfo: string;
  summary: string;
}

export async function scoutPlatform(name: string): Promise<ScoutResult> {
  const prompt = `
    Research the following name: "${name}" across these platforms:
    1. Azure (Cloud services, certifications, or professional profiles)
    2. Hugging Face (AI models, datasets, or contributions)
    3. GitHub (Repositories, code contributions, or projects)

    Provide a concise summary of their presence or lack thereof on each platform.
    If it's a project name, find the official repositories or documentation.
    If it's a person, find their professional contributions.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            azureInfo: { type: Type.STRING },
            huggingFaceInfo: { type: Type.STRING },
            gitHubInfo: { type: Type.STRING },
            summary: { type: Type.STRING },
          },
          required: ["name", "azureInfo", "huggingFaceInfo", "gitHubInfo", "summary"],
        },
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Scouting error:", error);
    return {
      name,
      azureInfo: "Search failed",
      huggingFaceInfo: "Search failed",
      gitHubInfo: "Search failed",
      summary: "An error occurred during the search.",
    };
  }
}
export async function generateDraft(from: string, subject: string, bodyPreview: string): Promise<string> {
  const prompt = `
    You are an assistant for Grantt Gouws at North-West University (NWU).
    Write a professional draft reply to the following email.
    
    Compliance & Protocol Requirements:
    - Adhere to NWU IT Policies and professional communication standards.
    - Ensure POPIA compliance: handle personal information with extreme care.
    - Maintain a professional, academic, yet helpful tone.
    
    Drafting Style (CRITICAL):
    - Start the draft with "/human ".
    - NO FLUFF. NO PUFFERY. Be direct, concise, and professional.
    - Use true source data only. No surface AI genericisms.
    - Mirror loop and recursion: reflect the core intent of the sender back in the solution.
    
    Constraints:
    - DO NOT use placeholder information (like [Date] or [Name]). If you don't know a detail, write the sentence in a way that doesn't require it or leave it for the user to fill manually without brackets.
    - The draft must be strictly related to the content of the email provided.
    - Do not assume information from other contexts.
    - This is a DRAFT only. The human will review and send it.
    
    Email to reply to:
    From: ${from}
    Subject: ${subject}
    Content: ${bodyPreview}
    
    Draft Reply:
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        temperature: 0,
        topP: 0.87,
      }
    });

    return response.text || "Could not generate draft.";
  } catch (error) {
    console.error("Draft generation error:", error);
    return "Error generating draft.";
  }
}

export async function classifyEmail(from: string, subject: string, bodyPreview: string): Promise<EmailClassification> {
  const prompt = `
    Classify the following email into one of these folders at North-West University (NWU):
    - 0_Recovered_2025_2026: Old items from 2025/early 2026.
    - 1_Students_Queries_2026: Student emails needing response (marks, extensions, etc).
    - 2_Admin_Management_2026: Management, HoD, faculty admin, circulars.
    - 3_Deadlines_Alerts_2026: Time-critical items (deadlines, marks capture, compliance).
    - 4_Other_To_Review_2026: Not urgent, needs thinking.
    - Events_Training_2026: Events, webinars, training, mentoring.

    Compliance & Protocol Requirements:
    - Adhere to NWU IT Policies and POPIA framework for data classification.
    - Prioritize student queries and time-critical deadlines.

    Email Details:
    From: ${from}
    Subject: ${subject}
    Preview: ${bodyPreview}

    Return the classification in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
      folder: "4_Other_To_Review_2026",
      reason: "Error during classification",
      priority: "Low",
      suggestedAction: "Review manually",
    };
  }
}
