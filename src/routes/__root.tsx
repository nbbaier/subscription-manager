/// <reference types="vite/client" />

import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "~/styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Subscription Manager",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<div className="min-h-screen bg-gray-50">
				<Navigation />
				<main className="container mx-auto py-6 px-4">
					<Outlet />
				</main>
			</div>
		</RootDocument>
	);
}

function Navigation() {
	return (
		<header className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg">
			<div className="container mx-auto px-4 py-4">
				<nav className="flex items-center justify-between">
					<h1 className="text-2xl font-bold">Subscription Manager</h1>
					<div className="flex gap-6">
						<Link
							to="/"
							className="hover:text-indigo-200 transition-colors [&.active]:text-white [&.active]:font-semibold"
						>
							Dashboard
						</Link>
						<Link
							to="/subscriptions"
							className="hover:text-indigo-200 transition-colors [&.active]:text-white [&.active]:font-semibold"
						>
							Subscriptions
						</Link>
						<Link
							to="/analytics"
							className="hover:text-indigo-200 transition-colors [&.active]:text-white [&.active]:font-semibold"
						>
							Analytics
						</Link>
						<Link
							to="/decisions"
							className="hover:text-indigo-200 transition-colors [&.active]:text-white [&.active]:font-semibold"
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
