import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface SpendingTrendData {
	month: string;
	amount: number;
	[key: string]: string | number;
}

interface SpendingTrendProps {
	data: SpendingTrendData[];
	color?: string;
}

export function SpendingTrend({ data, color = "#4f46e5" }: SpendingTrendProps) {
	return (
		<div className="h-[300px] w-full">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart
					data={data}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						vertical={false}
						stroke="#e5e7eb"
					/>
					<XAxis
						dataKey="month"
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#6b7280", fontSize: 12 }}
						dy={10}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#6b7280", fontSize: 12 }}
						tickFormatter={(value) => `$${value / 100}`}
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: "#fff",
							borderRadius: "8px",
							border: "1px solid #e5e7eb",
							boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
						}}
						formatter={(value) =>
							typeof value === "number" ? `$${(value / 100).toFixed(2)}` : ""
						}
					/>
					<Bar
						dataKey="amount"
						fill={color}
						radius={[4, 4, 0, 0]}
						barSize={40}
					/>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
