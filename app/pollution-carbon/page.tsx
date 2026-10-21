import type { Metadata } from "next";
import PollutionDashboard from "./Dashboard";

export const metadata: Metadata = {
  title: "Pollution → Carbon Credit Ledger | Kisan Carbon Hub",
  description:
    "Live AQI for Mandir Marg, Delhi pulled from AQICN, graphed by hour, day, month and day-part, then converted into the carbon credits every polluting industry should be producing in real time versus what they have actually produced.",
};

export default function PollutionCarbonPage() {
  return <PollutionDashboard />;
}
