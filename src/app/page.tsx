"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OfficeCard from "@/components/offices/OfficeCard";
import { useOfficeStore } from "@/store/office-store";
import { toast } from "sonner";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const { offices, isLoading, fetchOffices } = useOfficeStore();

  // Fetch offices on mount
  useEffect(() => {
    fetchOffices().catch((error) => {
      toast.error("Failed to load offices");
      console.error(error);
    });
  }, [fetchOffices]);

  // Filter offices by search query
  const filteredOffices = offices.filter((office) =>
    office.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to convert day format
  const convertDayFormat = (day: string): string => {
    const dayMap: Record<string, string> = {
      MONDAY: "Mon",
      TUESDAY: "Tue",
      WEDNESDAY: "Wed",
      THURSDAY: "Thu",
      FRIDAY: "Fri",
    };
    return dayMap[day] || day;
  };

  // Calculate "last updated" relative time
  const getRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return "1 week ago";
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return "over a month ago";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offices</h1>
          <p className="text-muted-foreground mt-1">
            Manage schedule templates for {offices.length} dental offices
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

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading offices...</p>
        </div>
      )}

      {/* Office Grid */}
      {!isLoading && filteredOffices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOffices.map((office) => (
            <OfficeCard
              key={office.id}
              id={office.id}
              name={office.name}
              dpms={office.dpmsSystem}
              providerCount={office.providerCount}
              dailyGoal={office.totalDailyGoal}
              workingDays={office.workingDays.map(convertDayFormat)}
              lastUpdated={getRelativeTime(office.updatedAt)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredOffices.length === 0 && offices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No offices found</p>
          <Link href="/offices/new">
            <Button variant="outline" className="mt-4">
              Create your first office
            </Button>
          </Link>
        </div>
      )}

      {/* No Results */}
      {!isLoading && filteredOffices.length === 0 && offices.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No offices match &ldquo;{searchQuery}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
