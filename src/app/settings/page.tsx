"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { type AppSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { useTheme } from "next-themes";

function loadStoredSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const stored = localStorage.getItem("app-settings");
  if (!stored) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadStoredSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const { setTheme: setNextTheme } = useTheme();

  useEffect(() => {
    document.title = "Settings - Custom Schedule Template";
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    try {
      localStorage.setItem("app-settings", JSON.stringify(settings));
      toast.success("Settings saved successfully!");
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem("app-settings");
    toast.success("Settings reset to defaults");
    setHasChanges(false);
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure default preferences for schedule generation
        </p>
      </div>

      {/* Schedule Defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Defaults</CardTitle>
          <CardDescription>
            Default values used when creating new offices and providers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="timeIncrement">Time Increment (minutes)</Label>
            <Select
              value={settings.timeIncrement.toString()}
              onValueChange={(value) => updateSetting("timeIncrement", parseInt(value))}
            >
              <SelectTrigger id="timeIncrement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Granularity of schedule time slots
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultStartTime">Default Start Time</Label>
              <Select
                value={settings.defaultStartTime}
                onValueChange={(value) => updateSetting("defaultStartTime", value)}
              >
                <SelectTrigger id="defaultStartTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="06:00">6:00 AM</SelectItem>
                  <SelectItem value="07:00">7:00 AM</SelectItem>
                  <SelectItem value="08:00">8:00 AM</SelectItem>
                  <SelectItem value="09:00">9:00 AM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="defaultEndTime">Default End Time</Label>
              <Select
                value={settings.defaultEndTime}
                onValueChange={(value) => updateSetting("defaultEndTime", value)}
              >
                <SelectTrigger id="defaultEndTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:00">4:00 PM</SelectItem>
                  <SelectItem value="17:00">5:00 PM</SelectItem>
                  <SelectItem value="18:00">6:00 PM</SelectItem>
                  <SelectItem value="19:00">7:00 PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultLunchStart">Default Lunch Start</Label>
              <Select
                value={settings.defaultLunchStart}
                onValueChange={(value) => updateSetting("defaultLunchStart", value)}
              >
                <SelectTrigger id="defaultLunchStart">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="11:00">11:00 AM</SelectItem>
                  <SelectItem value="12:00">12:00 PM</SelectItem>
                  <SelectItem value="13:00">1:00 PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="defaultLunchEnd">Default Lunch End</Label>
              <Select
                value={settings.defaultLunchEnd}
                onValueChange={(value) => updateSetting("defaultLunchEnd", value)}
              >
                <SelectTrigger id="defaultLunchEnd">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12:00">12:00 PM</SelectItem>
                  <SelectItem value="13:00">1:00 PM</SelectItem>
                  <SelectItem value="14:00">2:00 PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card>
        <CardHeader>
          <CardTitle>Behavior</CardTitle>
          <CardDescription>
            How the application handles schedules and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="autoSave">Auto-save schedules</Label>
              <p className="text-xs text-muted-foreground">
                Automatically save generated schedules to browser storage
              </p>
            </div>
            <Switch
              id="autoSave"
              checked={settings.autoSaveSchedules}
              onCheckedChange={(checked) => updateSetting("autoSaveSchedules", checked)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="warnings">Show production warnings</Label>
              <p className="text-xs text-muted-foreground">
                Display warnings when schedules don&apos;t meet production targets
              </p>
            </div>
            <Switch
              id="warnings"
              checked={settings.showProductionWarnings}
              onCheckedChange={(checked) => updateSetting("showProductionWarnings", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the application looks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(value) => {
                updateSetting("theme", value as AppSettings["theme"]);
                setNextTheme(value);
              }}
            >
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Choose your preferred color scheme
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row justify-between gap-3">
        <Button variant="outline" onClick={handleReset} className="min-h-[44px]">
          Reset to Defaults
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges} className="min-h-[44px]">
          {hasChanges ? "Save Changes" : "No Changes"}
        </Button>
      </div>
    </div>
  );
}
