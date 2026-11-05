import assert from "node:assert/strict";
import { chooseHandoff } from "./marketplace-session.ts";

const decision = chooseHandoff("order-42", "buyer-1", "seller-1");
assert.equal(decision, "ready-for-order-handoff");
assert.equal(chooseHandoff("", "buyer-1", "seller-1"), "needs-review");
assert.equal(chooseHandoff("order-42", "same-user", "same-user"), "needs-review");
console.log("handoff decision test passed");
