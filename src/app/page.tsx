"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OfficeCard from "@/components/offices/OfficeCard";

// Mock data
const mockOffices = [
  {
    id: "1",
    name: "Smile Cascade",
    dpms: "Dentrix",
    providerCount: 5,
    dailyGoal: 11984,
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    lastUpdated: "2 days ago",
  },
  {
    id: "2",
    name: "CDT Comfort Dental",
    dpms: "Open Dental",
    providerCount: 7,
    dailyGoal: 15600,
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    lastUpdated: "1 week ago",
  },
  {
    id: "3",
    name: "Los Altos",
    dpms: "Eaglesoft",
    providerCount: 4,
    dailyGoal: 9200,
    workingDays: ["Mon", "Tue", "Wed", "Thu"],
    lastUpdated: "3 days ago",
  },
];

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOffices = mockOffices.filter((office) =>
    office.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offices</h1>
          <p className="text-muted-foreground mt-1">
            Manage schedule templates for {mockOffices.length} dental offices
          </p>
        </div>
        <Link href="/offices/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Office
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search offices..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Office Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOffices.map((office) => (
          <OfficeCard key={office.id} {...office} />
        ))}
      </div>

      {filteredOffices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No offices found</p>
        </div>
      )}
    </div>
  );
}
