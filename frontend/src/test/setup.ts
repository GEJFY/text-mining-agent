import "@testing-library/jest-dom";

// jsdom に ResizeObserver が存在しないため、recharts 用にモック
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
