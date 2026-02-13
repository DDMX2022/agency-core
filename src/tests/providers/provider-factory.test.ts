import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLLMProvider, MockLLM, OpenAILLM } from "../../providers/index.js";

// Mock OpenAI SDK so it doesn't need a real key at import time
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

describe("createLLMProvider", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env["OPENAI_API_KEY"];
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env["OPENAI_API_KEY"] = originalKey;
    } else {
      delete process.env["OPENAI_API_KEY"];
    }
  });

  it("should return MockLLM when forceProvider=mock", () => {
    process.env["OPENAI_API_KEY"] = "some-key";
    const llm = createLLMProvider({ forceProvider: "mock" });
    expect(llm).toBeInstanceOf(MockLLM);
  });

  it("should return OpenAILLM when forceProvider=openai", () => {
    process.env["OPENAI_API_KEY"] = "some-key";
    const llm = createLLMProvider({ forceProvider: "openai" });
    expect(llm).toBeInstanceOf(OpenAILLM);
  });

  it("should auto-detect OpenAI when OPENAI_API_KEY is set", () => {
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    const llm = createLLMProvider();
    expect(llm).toBeInstanceOf(OpenAILLM);
  });

  it("should fallback to MockLLM when no key is set", () => {
    delete process.env["OPENAI_API_KEY"];
    const llm = createLLMProvider();
    expect(llm).toBeInstanceOf(MockLLM);
  });

  it("should pass custom model to OpenAI", () => {
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    const llm = createLLMProvider({ model: "gpt-4o-mini" });
    expect(llm.name).toBe("OpenAI/gpt-4o-mini");
  });
});
