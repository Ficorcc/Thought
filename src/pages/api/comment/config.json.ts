import { runtimeCommentConfig } from "$lib/comment-runtime";

export const prerender = false;

export function GET() {
	return Response.json(runtimeCommentConfig(), {
		headers: {
			"Cache-Control": "no-store"
		}
	});
}
