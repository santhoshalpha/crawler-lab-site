// import type { BotHit } from "./types";

// export class LoggerDO {
//   constructor(private state: DurableObjectState) {}

//   async fetch(request: Request) {
//     const url = new URL(request.url);

//     // Append event
//     if (url.pathname === "/append" && request.method === "POST") {
//       const hit = (await request.json()) as BotHit;

//       const raw = (await this.state.storage.get<string>("events")) || "[]";
//       const arr: BotHit[] = JSON.parse(raw);

//       arr.push(hit);

//       // Keep last 500
//       const sliced = arr.length > 500 ? arr.slice(arr.length - 500) : arr;
//       await this.state.storage.put("events", JSON.stringify(sliced));

//       return new Response("ok");
//     }

//     // Read events
//     if (url.pathname === "/read") {
//       const raw = (await this.state.storage.get<string>("events")) || "[]";
//       return new Response(raw, { headers: { "content-type": "application/json" } });
//     }

//     return new Response("not found", { status: 404 });
//   }
// }
