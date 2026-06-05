import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { getRelativeLocaleUrl } from "astro:i18n";
import { env, waitUntil } from "cloudflare:workers";
import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { email as enabled } from "$config";
import { Email } from "$db/schema";
import { render } from "$lib/email";
import sendEmail from "$lib/email/util";
import { AESEncryption, Token } from "$lib/token";
import i18nit from "$i18n";

export const email = {
	confirm: defineAction({
		input: z.string(),
		handler: async ticket => {
			const claim = AESEncryption.decrypt(new Uint8Array(Buffer.from(ticket, "base64url")));
			if (!claim) return "invalid";

			const db = drizzle(env.DB);

			const timestamp = new DataView(claim.buffer).getBigUint64(0, false);
			const identity = new TextDecoder().decode(claim.slice(8));
			const [drifter, address] = identity.split("|");
			if (!drifter || !address) return "invalid";

			const ExpirationDuration = 5 * 60 * 1000;
			if (BigInt(Date.now()) - timestamp > BigInt(ExpirationDuration)) return "expired";

			const result = await db
				.update(Email)
				.set({ state: "verified" })
				.where(and(eq(Email.drifter, drifter), eq(Email.address, address), eq(Email.state, "pending")))
				.returning();

			if (result.length === 0) {
				const result = await db
					.select({ state: Email.state })
					.from(Email)
					.where(and(eq(Email.drifter, drifter), eq(Email.address, address)))
					.get();

				if (!result) return "invalid";
				return result.state === "verified" ? "already" : "invalid";
			}

			return "success";
		}
	}),

	unsubscribe: defineAction({
		input: z.string(),
		handler: async pass => {
			const claim = AESEncryption.decrypt(new Uint8Array(Buffer.from(pass, "base64url")));
			if (!claim) return "invalid";

			const db = drizzle(env.DB);

			const identity = new TextDecoder().decode(claim);
			const [drifter, address] = identity.split("|");
			if (!drifter || !address) return "invalid";

			const result = await db
				.update(Email)
				.set({ notify: false })
				.where(and(eq(Email.drifter, drifter), eq(Email.address, address), eq(Email.notify, true)))
				.returning();

			return result.length === 0 ? "invalid" : "success";
		}
	}),

	// Action to initiate email verification process
	verify: defineAction({
		input: z.object({
			locale: z.string(), // locale code for generating the link
			address: z.string().email().optional() // email address to verify, left empty to resend
		}),
		handler: async ({ locale, address }, { cookies, site }) => {
			// Check if email feature is enabled
			if (!enabled) throw new ActionError({ code: "FORBIDDEN" });

			// Verify user authentication
			const drifter = (await Token.check(cookies, "passport"))?.visa;
			if (!drifter) throw new ActionError({ code: "UNAUTHORIZED" });

			// Apply rate limiting to prevent spam
			const { success } = await env.EMAIL_LIMIT.limit({ key: drifter });
			if (!success) throw new ActionError({ code: "TOO_MANY_REQUESTS" });

			// Initialize database connection
			const db = drizzle(env.DB);

			if (address) {
				// Insert or update email record with pending state
				const result = await db
					.insert(Email)
					.values({ drifter, address, state: "pending" })
					.onConflictDoUpdate({
						target: Email.drifter,
						set: { address, state: "pending" },
						setWhere: ne(Email.address, address)
					})
					.returning();

				// Prevent updating with the same email address
				if (result.length === 0) throw new ActionError({ code: "CONFLICT" });
			} else {
				// Fetch existing email record for resending verification
				const result = await db
					.select({ address: Email.address })
					.from(Email)
					.where(and(eq(Email.drifter, drifter), eq(Email.state, "pending")))
					.get();

				if (!result) throw new ActionError({ code: "NOT_FOUND" });

				// Use existing address for resending
				address = result.address;
			}

			// Construct verification ticket
			const bytes = new TextEncoder().encode(`${drifter}|${address}`);
			const claim = new Uint8Array(8 + bytes.length);
			new DataView(claim.buffer).setBigUint64(0, BigInt(Date.now()), false);
			claim.set(bytes, 8);

			// Encrypt the ticket
			const ticket = AESEncryption.encrypt(claim);
			if (!ticket) throw new ActionError({ code: "INTERNAL_SERVER_ERROR" });

			// Generate verification link
			const link = new URL(getRelativeLocaleUrl(locale, "/email"), site);
			link.searchParams.set("ticket", Buffer.from(ticket).toString("base64url"));

			const t = i18nit(locale, "email");

			// Send verification email
			waitUntil(
				sendEmail(locale, drifter, address, {
					subject: t("verification.subject"),
					html: render("verification", {
						title: t("verification.html.title"),
						instruction: t("verification.html.instruction"),
						button: t("verification.html.button"),
						link
					}),
					text: t("verification.text", { link: link.toString() })
				})
			);
		}
	}),

	// Action to remove email record
	remove: defineAction({
		handler: async (_, { cookies }) => {
			// Check if email feature is enabled
			if (!enabled) throw new ActionError({ code: "FORBIDDEN" });

			// Verify user authentication
			const drifter = (await Token.check(cookies, "passport"))?.visa;
			if (!drifter) throw new ActionError({ code: "UNAUTHORIZED" });

			// Initialize database connection
			const db = drizzle(env.DB);

			// Remove email record
			await db.delete(Email).where(eq(Email.drifter, drifter));
		}
	})
};
