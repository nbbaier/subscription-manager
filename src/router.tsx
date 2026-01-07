import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
			<h1 className="text-2xl font-semibold">Page Not Found</h1>
			<p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
			<a href="/" className="text-primary hover:underline">Go home</a>
		</div>
	);
}

export function getRouter() {
	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		defaultNotFoundComponent: NotFound,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
