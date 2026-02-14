"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OfficeCard from "@/components/offices/OfficeCard";
import { useOfficeStore } from "@/store/office-store";
import { toast } from "sonner";
import { mockOffices } from "@/lib/mock-data";
import { OfficeListSkeleton } from "@/components/LoadingState";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const { offices, isLoading, fetchOffices, setOffices } = useOfficeStore();

  // Set page title
  useEffect(() => {
    document.title = "Schedule Template Designer";
  }, []);

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

  // Load demo data
  const handleLoadDemoData = () => {
    setLoadingDemo(true);
    try {
      // Directly set offices state to mockOffices
      setOffices(mockOffices);
      toast.success("Demo data loaded! 5 sample offices are now available.");
    } catch (error) {
      console.error("Error loading demo data:", error);
      toast.error("Failed to load demo data");
    } finally {
      setLoadingDemo(false);
    }
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
        <div className="flex gap-2">
          {offices.length === 0 && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleLoadDemoData}
              disabled={loadingDemo}
            >
              <Sparkles className="w-4 h-4" />
              {loadingDemo ? "Loading..." : "Load Demo Data"}
            </Button>
          )}
          <Link href="/offices/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Office
            </Button>
          </Link>
        </div>
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
      {isLoading && <OfficeListSkeleton />}

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
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">No offices yet</h2>
              <p className="text-muted-foreground">
                Get started by creating your first office template or load demo data to explore the app.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Link href="/offices/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Office
                </Button>
              </Link>
              <Button 
                variant="outline"
                onClick={handleLoadDemoData}
                disabled={loadingDemo}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {loadingDemo ? "Loading..." : "Load Demo Data"}
              </Button>
            </div>
          </div>
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
