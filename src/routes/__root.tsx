/// <reference types="vite/client" />

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60, // 1 minute
			refetchOnWindowFocus: false,
		},
	},
});

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Subscription Manager" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<QueryClientProvider client={queryClient}>
				<div className="min-h-screen bg-background">
					<Navigation />
					<main className="container mx-auto py-6 px-4">
						<Outlet />
					</main>
				</div>
			</QueryClientProvider>
		</RootDocument>
	);
}

function Navigation() {
	return (
		<header className="bg-primary text-primary-foreground shadow-lg">
			<div className="container mx-auto px-4 py-4">
				<nav className="flex items-center justify-between">
					<h1 className="text-2xl font-bold">Subscription Manager</h1>
					<div className="flex gap-6">
						<Link
							to="/"
							className="hover:opacity-80 transition-opacity [&.active]:opacity-100 [&.active]:font-semibold [&:not(.active)]:opacity-70"
						>
							Dashboard
						</Link>
						<Link
							to="/subscriptions"
							className="hover:opacity-80 transition-opacity [&.active]:opacity-100 [&.active]:font-semibold [&:not(.active)]:opacity-70"
						>
							Subscriptions
						</Link>
						<Link
							to="/analytics"
							className="hover:opacity-80 transition-opacity [&.active]:opacity-100 [&.active]:font-semibold [&:not(.active)]:opacity-70"
						>
							Analytics
						</Link>
						<Link
							to="/decisions"
							className="hover:opacity-80 transition-opacity [&.active]:opacity-100 [&.active]:font-semibold [&:not(.active)]:opacity-70"
						>
							Decisions
						</Link>
					</div>
				</nav>
			</div>
		</header>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
