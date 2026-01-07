import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface UsageData {
	date: string;
	usage: number;
	[key: string]: string | number;
}

interface UsageTrendProps {
	data: UsageData[];
	color?: string;
}

export function UsageTrend({ data, color = "#6366f1" }: UsageTrendProps) {
	return (
		<div className="h-[300px] w-full">
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart
					data={data}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<defs>
						<linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={color} stopOpacity={0.3} />
							<stop offset="95%" stopColor={color} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						vertical={false}
						stroke="#e5e7eb"
					/>
					<XAxis
						dataKey="date"
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#6b7280", fontSize: 12 }}
						dy={10}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#6b7280", fontSize: 12 }}
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: "#fff",
							borderRadius: "8px",
							border: "1px solid #e5e7eb",
							boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
						}}
					/>
					<Area
						type="monotone"
						dataKey="usage"
						stroke={color}
						strokeWidth={2}
						fillOpacity={1}
						fill="url(#colorUsage)"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}
