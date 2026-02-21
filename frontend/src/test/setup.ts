import "@testing-library/jest-dom";

// jsdom に ResizeObserver が存在しないため、recharts 用にモック
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
