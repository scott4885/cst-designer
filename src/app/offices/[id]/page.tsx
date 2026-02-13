"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ScheduleGrid, { ProviderInput, TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import ProductionSummary, { ProviderProductionSummary } from "@/components/schedule/ProductionSummary";
import { toast } from "sonner";

// Mock data for Smile Cascade
const mockOffice = {
  id: "1",
  name: "Smile Cascade",
  dpms: "Dentrix",
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
};

const mockProviders: ProviderInput[] = [
  { id: "p1", name: "Dr. Fitzpatrick", role: "Doctor", color: "#ec8a1b" },
  { id: "p2", name: "Cheryl Dise RDH", role: "Hygienist", color: "#87bcf3" },
  { id: "p3", name: "HYG 2", role: "Hygienist", color: "#f4de37" },
];

const mockProductionSummaries: ProviderProductionSummary[] = [
  {
    providerName: "Dr. Fitzpatrick",
    providerColor: "#ec8a1b",
    dailyGoal: 5000,
    target75: 3750,
    actualScheduled: 0,
  },
  {
    providerName: "Cheryl Dise RDH",
    providerColor: "#87bcf3",
    dailyGoal: 2600,
    target75: 1950,
    actualScheduled: 0,
  },
  {
    providerName: "HYG 2",
    providerColor: "#f4de37",
    dailyGoal: 1800,
    target75: 1350,
    actualScheduled: 0,
  },
];

export default function TemplateBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const [activeDay, setActiveDay] = useState("Mon");
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [scheduleGenerated, setScheduleGenerated] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlotOutput[]>([]);

  const handleGenerateSchedule = () => {
    // Mock schedule generation
    toast.success("Generating optimized schedule...");
    
    // Simulate AI generation after a delay
    setTimeout(() => {
      // Generate mock schedule with some blocks
      const mockSlots: TimeSlotOutput[] = [];
      
      // Sample blocks for demonstration
      const sampleBlocks = [
        { time: "7:00 AM", p1: { staffingCode: "D", blockLabel: "HP>$1200" } },
        { time: "7:10 AM", p1: { staffingCode: "D", blockLabel: "HP>$1200" } },
        { time: "8:00 AM", p2: { staffingCode: "H", blockLabel: "Recare>$150" } },
        { time: "9:00 AM", p1: { staffingCode: "D", blockLabel: "NP>$300" } },
      ];

      // Generate all time slots
      let hour = 7;
      let minute = 0;
      
      while (hour < 18 || (hour === 18 && minute === 0)) {
        const formattedHour = hour > 12 ? hour - 12 : hour;
        const period = hour >= 12 ? "PM" : "AM";
        const formattedMinute = minute.toString().padStart(2, "0");
        const timeStr = `${formattedHour}:${formattedMinute} ${period}`;
        
        // Check if lunch time (1:00-2:00 PM)
        const isLunchTime = (hour === 13 || hour === 14) && hour < 14;
        
        const slot: TimeSlotOutput = {
          time: timeStr,
          slots: mockProviders.map(p => ({
            providerId: p.id,
            isBreak: isLunchTime,
          })),
        };
        
        // Add sample blocks
        const sampleBlock = sampleBlocks.find(b => b.time === timeStr);
        if (sampleBlock) {
          Object.keys(sampleBlock).forEach(key => {
            if (key !== 'time') {
              const providerSlot = slot.slots.find(s => s.providerId === key);
              if (providerSlot) {
                Object.assign(providerSlot, (sampleBlock as any)[key]);
              }
            }
          });
        }
        
        mockSlots.push(slot);
        
        minute += 10;
        if (minute >= 60) {
          minute = 0;
          hour += 1;
        }
      }
      
      setTimeSlots(mockSlots);
      setScheduleGenerated(true);
      toast.success("Schedule generated successfully!");
    }, 1500);
  };

  const handleExport = () => {
    toast.success("Exporting to Excel...");
    // TODO: Implement Excel export
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{mockOffice.name}</h1>
            <p className="text-muted-foreground text-sm">
              {mockOffice.dpms} • Template Builder
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={handleGenerateSchedule}>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Schedule
          </Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Panel - Office Info */}
        <div
          className={`transition-all duration-300 ${
            leftPanelCollapsed ? "w-12" : "w-80"
          } flex-shrink-0`}
        >
          {leftPanelCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftPanelCollapsed(false)}
              className="w-full h-12"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          ) : (
            <Card className="h-full overflow-auto">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm">Office Information</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLeftPanelCollapsed(true)}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Providers
                  </h3>
                  <div className="space-y-2">
                    {mockProviders.map((provider) => (
                      <div key={provider.id} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: provider.color }}
                        />
                        <div>
                          <p className="text-sm font-medium">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">{provider.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Working Days
                  </h3>
                  <div className="flex gap-1">
                    {mockOffice.workingDays.map((day) => (
                      <div
                        key={day}
                        className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium border border-accent/30"
                      >
                        {day[0]}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    System
                  </h3>
                  <p className="text-sm">{mockOffice.dpms}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Center Panel - Schedule Grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={activeDay} onValueChange={setActiveDay} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="Mon">Monday</TabsTrigger>
              <TabsTrigger value="Tue">Tuesday</TabsTrigger>
              <TabsTrigger value="Wed">Wednesday</TabsTrigger>
              <TabsTrigger value="Thu">Thursday</TabsTrigger>
              <TabsTrigger value="Fri">Friday</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto">
              {mockOffice.workingDays.map((day) => (
                <TabsContent key={day} value={day} className="h-full mt-0">
                  <Card className="h-full">
                    <CardContent className="p-6">
                      <ScheduleGrid
                        slots={scheduleGenerated ? timeSlots : []}
                        providers={mockProviders}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>

        {/* Right Panel - Production Summary */}
        <div className="w-80 flex-shrink-0 overflow-auto">
          <ProductionSummary summaries={mockProductionSummaries} />
        </div>
      </div>
    </div>
  );
}
