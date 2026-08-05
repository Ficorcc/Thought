import { getEntry } from "astro:content";
import { env } from "cloudflare:workers";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Comment, CommentHistory, Drifter, Notification } from "$db/schema";
import config, { monolocale } from "$config";
import i18nit from "$i18n";

type ManagedSection = "note" | "guide" | "jotting" | "preface";

function resolveCommentLocale(item: string) {
	if (monolocale) return config.i18n.defaultLocale;
	const [locale] = item.split("/");
	return (config.i18n.locales as readonly string[]).includes(locale) ? locale : config.i18n.defaultLocale;
}

async function resolveCommentTarget(section: ManagedSection, item: string, locale: string) {
	const targetLocale = resolveCommentLocale(item);
	const prefix = monolocale || targetLocale === config.i18n.defaultLocale ? "" : `/${targetLocale}`;

	if (section === "preface") {
		return {
			title: i18nit(locale)("navigation.preface"),
			url: `${prefix}/preface#${item}`,
			locale: targetLocale
		};
	}

	const entry = await getEntry(section, item);
	const slug = monolocale ? item : item.split("/").slice(1).join("/") || item;
	return {
		title: entry?.data.title ?? item,
		url: `${prefix}/${section}/${slug}`,
		locale: targetLocale
	};
}

export async function listAdminComments(
	locale = "zh-cn",
	keyword?: string,
	section: ManagedSection | "all" = "all",
	state: "all" | "active" | "deleted" = "all"
) {
	const authorId = env.AUTHOR_ID ?? null;
	const db = drizzle(env.DB);
	const conditions = [];

	if (section !== "all") conditions.push(eq(Comment.section, section));
	if (state === "active") conditions.push(or(isNull(Comment.deleted), eq(Comment.deleted, false)));
	if (state === "deleted") conditions.push(eq(Comment.deleted, true));

	const comments = await db
		.select({
			id: Comment.id,
			section: Comment.section,
			item: Comment.item,
			reply: Comment.reply,
			drifter: Comment.drifter,
			timestamp: Comment.timestamp,
			updated: Comment.updated,
			deleted: Comment.deleted,
			content: Comment.content,
			nickname: Comment.nickname,
			email: Comment.email,
			homepage: sql<string | null>`coalesce(${Drifter.homepage}, ${Comment.homepage})`,
			name: sql<string | null>`coalesce(${Drifter.name}, ${Drifter.handle})`,
			description: Drifter.description,
			image: Drifter.image,
			author: sql`CASE WHEN ${Drifter.id} = ${authorId} THEN 1 ELSE 0 END`
		})
		.from(Comment)
		.leftJoin(Drifter, eq(Comment.drifter, Drifter.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(Comment.timestamp));

	const records = await Promise.all(
		comments.map(async comment => {
			const target = await resolveCommentTarget(comment.section as ManagedSection, comment.item, locale);
			return { ...comment, title: target.title, url: target.url, locale: target.locale };
		})
	);

	const query = keyword?.toLocaleLowerCase();
	const filtered = !query
		? records
		: records.filter(comment =>
				[comment.title, comment.item, comment.content, comment.name, comment.nickname, comment.email, comment.section, comment.reply]
					.filter((value): value is string => Boolean(value))
					.some(value => value.toLocaleLowerCase().includes(query))
			);

	return { comments: filtered, count: filtered.length };
}

export async function countAdminComments() {
	const db = drizzle(env.DB);
	const result = await db.select({ count: sql<number>`count(*)` }).from(Comment).get();
	return Number(result?.count || 0);
}

export async function listAdminCommentHistory(id: string) {
	const db = drizzle(env.DB);
	return db
		.select({
			id: CommentHistory.id,
			comment: CommentHistory.comment,
			timestamp: CommentHistory.timestamp,
			content: CommentHistory.content
		})
		.from(CommentHistory)
		.where(eq(CommentHistory.comment, id))
		.orderBy(CommentHistory.timestamp);
}

export async function deleteAdminComment(id: string) {
	const db = drizzle(env.DB);
	await db.update(Comment).set({ deleted: true }).where(eq(Comment.id, id));
}

export async function restoreAdminComment(id: string) {
	const db = drizzle(env.DB);
	await db.update(Comment).set({ deleted: false }).where(eq(Comment.id, id));
}

export async function purgeAdminComment(id: string) {
	const db = drizzle(env.DB);
	const target = await db.select({ id: Comment.id, reply: Comment.reply, deleted: Comment.deleted }).from(Comment).where(eq(Comment.id, id)).get();
	if (!target?.deleted) throw new Error("只能彻底删除已经标记删除的评论。");
	await db
		.update(Comment)
		.set({ reply: target.reply ?? null })
		.where(eq(Comment.reply, id));
	await db.delete(Notification).where(eq(Notification.comment, id));
	await db.delete(Comment).where(eq(Comment.id, id));
}
