"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getUserTeamDetails } from "@/lib/teamHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/ui/icons";

export function BrainstormSubmission() {
  const [file, setFile] = useState<File | null>(null);
  const [activeGrouping, setActiveGrouping] = useState<string | null>(null); // State for active grouping
  const [isLoading, setIsLoading] = useState(false);
  const [teamDetails, setTeamDetails] = useState<{ teamId: string; teamName: string; authorName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  // Fetch user, team details, and active grouping
  useEffect(() => {
    const fetchUserDataAndGrouping = async () => {
      const { data: user, error } = await supabase.auth.getUser();
      if (error || !user?.user?.email) {
        console.warn("⚠️ No authenticated user found.");
        return;
      }

      const teamData = await getUserTeamDetails(user.user.email);
      if (teamData) {
        setTeamDetails(teamData);

        // Step 1: Fetch team's groupings from teamGroupings
        const { data: teamGroupings, error: groupingError } = await supabase
          .from("teamGroupings")
          .select("grouping")
          .eq("teamName", teamData.teamName);

        if (groupingError || !teamGroupings || teamGroupings.length === 0) {
          console.warn("No groupings found for team:", groupingError?.message);
          return;
        }

        // Step 2: Check which (if any) of these groupings are active in groupingStatus
        const groupingNames = teamGroupings.map((g) => g.grouping);
        const { data: activeGroupings, error: statusError } = await supabase
          .from("groupingStatus")
          .select("grouping")
          .in("grouping", groupingNames)
          .eq("status", "active");

        if (statusError || !activeGroupings || activeGroupings.length === 0) {
          console.warn("No active groupings found:", statusError?.message);
          return;
        }

        // Step 3: Take the first active grouping
        const activeGroup = activeGroupings[0]?.grouping || null;
        setActiveGrouping(activeGroup);
      }
    };

    fetchUserDataAndGrouping();
  }, []);

  // Reset form after submission
  const resetForm = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (formRef.current) formRef.current.reset();
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
  };

  // Upload PDF to Supabase Storage
  const uploadFile = async () => {
    if (!teamDetails || !file) return null;

    const filePath = `brainstormMaps/${teamDetails.teamId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("brainstormMap").upload(filePath, file);

    if (error) {
      toast({
        title: "Upload Error",
        description: `Failed to upload ${file.name}.`,
        variant: "destructive",
      });
      return null;
    }

    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brainstormMap/${filePath}`;
  };

  // Submit brainstorm map to Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!teamDetails) {
      toast({
        title: "Submission Failed",
        description: "No team information found.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const fileUrl = await uploadFile();
      if (!fileUrl) {
        throw new Error("File upload failed.");
      }

      const { error } = await supabase.from("brainstormMaps").insert([
        {
          teamId: teamDetails.teamId,
          authorName: teamDetails.authorName,
          fileUrl,
          stage: activeGrouping, // Set stage to active grouping or null
          createdAt: new Date().toISOString(),
        },
      ]);

      if (error) {
        throw error;
      }

      toast({
        title: "Brainstorm Map Submitted",
        description: "Your brainstorm map has been submitted successfully.",
      });

      resetForm();
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Submit Brainstorm Map</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brainstormMap">Upload Brainstorm Map (PDF)</Label>
            <Input
              id="brainstormMap"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              ref={fileInputRef}
              required
            />
            {file && <p className="text-sm text-gray-500">Selected file: {file.name}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading || !file}>
            {isLoading ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : "Submit Brainstorm Map"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}