import { expect, test } from "bun:test";
import {
  Client,
  Events,
  GatewayIntentBits,
  InteractionCollector,
  type Message,
} from "discord.js";

test("component wait timeouts release their client listeners", async () => {
  const client = new Client<true>({ intents: [GatewayIntentBits.Guilds] });
  const events = [
    Events.InteractionCreate,
    Events.MessageDelete,
    Events.MessageBulkDelete,
    Events.ChannelDelete,
    Events.ThreadDelete,
    Events.GuildDelete,
  ];
  const counts = events.map((event) => client.listenerCount(event));
  const maxListeners = client.getMaxListeners();
  const message = {
    id: "123456789012345678",
    channelId: "123456789012345679",
    guildId: "123456789012345680",
  } as Message;
  try {
    for (let iteration = 0; iteration < 20; iteration++) {
      const collector = new InteractionCollector(client, {
        message,
        time: 1,
        max: 1,
      });
      const reason = await new Promise<string>((resolve) => {
        collector.once("end", (_collected, reason) => resolve(reason));
      });
      expect(reason).toBe("time");
      expect(events.map((event) => client.listenerCount(event))).toEqual(
        counts,
      );
      expect(client.getMaxListeners()).toBe(maxListeners);
    }
  } finally {
    await client.destroy();
  }
});
