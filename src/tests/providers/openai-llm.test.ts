import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the OpenAI SDK ────────────────────────────────────────────
const mockCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

import { OpenAILLM } from "../../providers/openai-llm.js";

describe("OpenAILLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw if no API key is provided", () => {
    const original = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];

    expect(() => new OpenAILLM({ apiKey: undefined })).toThrow(
      "OPENAI_API_KEY is required"
    );

    if (original) process.env["OPENAI_API_KEY"] = original;
  });

  it("should accept an explicit API key", () => {
    const provider = new OpenAILLM({ apiKey: "test-key" });
    expect(provider.name).toBe("OpenAI/gpt-4o");
  });

  it("should accept a custom model", () => {
    const provider = new OpenAILLM({ apiKey: "test-key", model: "gpt-4o-mini" });
    expect(provider.name).toBe("OpenAI/gpt-4o-mini");
  });

  it("should call OpenAI and return content", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hello from GPT" } }],
    });

    const provider = new OpenAILLM({ apiKey: "test-key" });
    const result = await provider.generate("You are a bot.", "Say hi");

    expect(result).toBe("Hello from GPT");
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a bot." },
          { role: "user", content: "Say hi" },
        ],
      })
    );
  });

  it("should throw on empty response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const provider = new OpenAILLM({ apiKey: "test-key" });
    await expect(provider.generate("sys", "msg")).rejects.toThrow(
      "OpenAI returned an empty response"
    );
  });

  it("should propagate API errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const provider = new OpenAILLM({ apiKey: "test-key" });
    await expect(provider.generate("sys", "msg")).rejects.toThrow(
      "Rate limit exceeded"
    );
  });
});
