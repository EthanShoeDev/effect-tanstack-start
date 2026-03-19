import { expect, test } from "vite-plus/test";
import { makeApiClientTag, makeSsrApiClientLayer, makeHttpApiClientLayer, mountApi } from "../src";

test("exports are functions", () => {
  expect(typeof makeApiClientTag).toBe("function");
  expect(typeof makeSsrApiClientLayer).toBe("function");
  expect(typeof makeHttpApiClientLayer).toBe("function");
  expect(typeof mountApi).toBe("function");
});
