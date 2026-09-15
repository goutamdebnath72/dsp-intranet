"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  X,
  UploadCloud,
  File,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { DateTime } from "luxon";
import { DayPicker } from "react-day-picker";
import { AnimatedInput } from "./AnimatedInput";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newCircular: any) => void;
};

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function CircularUploadModal({
  isOpen,
  onClose,
  onUploadSuccess,
}: Props) {
  // 1. Initialize NextAuth session
  const { data: session } = useSession();

  const [headline, setHeadline] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  // Circular's issue date (the value sent as publishedAt).
  const [publishedDate, setPublishedDate] = useState<DateTime | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const today = DateTime.local().startOf("day");

  const resetState = useCallback(() => {
    setHeadline("");
    setFile(null);
    setPreview(null);
    setStatus("idle");
    setUploadProgress(0);
    setErrorMessage("");
    setPublishedDate(null);
    setIsCalendarOpen(false);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      const droppedFile = acceptedFiles[0];
      setFile(droppedFile);
      if (droppedFile.type.startsWith("image/")) {
        setPreview(URL.createObjectURL(droppedFile));
      } else {
        setPreview(null);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    maxSize: 15 * 1024 * 1024, // Enforces the 15MB strict limit
  });

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Lock background page scroll while this modal is open so mouse-wheel
  // scrolling inside the modal never bleeds through to the admin page behind it.
  useEffect(() => {
    if (!isOpen) return;
    const { body, documentElement: html } = document;
    const scrollBarWidth = window.innerWidth - html.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollBarWidth > 0) body.style.paddingRight = `${scrollBarWidth}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [isOpen]);

  // Close the calendar popover when clicking outside it.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }
    if (isCalendarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCalendarOpen]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || !headline || !publishedDate) return;

    setStatus("uploading");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("headline", headline);
    formData.append("file", file);
    // Send the circular's issue date as an ISO date (yyyy-mm-dd).
    formData.append("publishedAt", publishedDate.toISODate() || "");

    // Append the ticket number from the active session
    if (session?.user?.ticketNo) {
      formData.append("authorTicketNo", String(session.user.ticketNo));
    }

    try {
      const response = await axios.post("/api/circulars", formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1),
          );
          setUploadProgress(percentCompleted);
        },
      });

      setStatus("success");
      onUploadSuccess(response.data);
      setTimeout(() => {
        onClose();
        resetState();
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(
        err.response?.data?.error || "An unexpected error occurred.",
      );
    }
  };

  const handleClose = () => {
    if (status !== "success") {
      resetState();
    }
    onClose();
  };

  const isBusy = status === "uploading" || status === "success";

  // Shared react-day-picker styling — mirrors EventCalendar for symmetry.
  const dayPickerClassNames: React.ComponentProps<
    typeof DayPicker
  >["classNames"] = {
    root: "bg-white p-3 rounded-lg shadow-lg border border-neutral-200",
    caption: "flex items-center justify-center mb-3 px-1 relative h-8",
    caption_label: "sr-only",
    caption_dropdowns: "flex items-center justify-center gap-1.0",
    dropdown:
      "appearance-none bg-transparent border-0 px-1 py-0.5 text-base font-bold font-heading text-neutral-800 cursor-pointer hover:text-primary-600 transition-colors focus:outline-none",
    dropdown_month: "relative",
    dropdown_year: "relative",
    vhidden: "sr-only",
    nav: "flex items-center space-x-1",
    nav_button:
      "p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition-colors",
    nav_button_previous: "absolute left-1 top-1/2 -translate-y-1/2",
    nav_button_next: "absolute right-1 top-1/2 -translate-y-1/2",
    table: "w-full border-collapse",
    head_row: "flex mb-2",
    head_cell:
      "text-neutral-500 rounded-md font-medium text-[0.7rem] uppercase w-9 text-center",
    row: "flex w-full mt-1",
    cell: "text-center text-sm p-0 relative w-9",
    day: "w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors cursor-pointer",
    day_selected:
      "bg-primary-600 text-white hover:bg-primary-600 font-bold",
    day_today: "font-bold text-primary-600",
    day_outside: "text-neutral-300 opacity-50",
    day_disabled: "text-neutral-300 opacity-40 cursor-not-allowed line-through",
    day_hidden: "invisible",
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-white/80 backdrop-blur-xl border border-white/30 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 h-0 self-end pr-1">
          <button onClick={handleClose} className="modal-close-button">
            <X size={28} />
          </button>
        </div>

        <header className="p-6">
          <h2 className="text-2xl font-bold font-heading text-neutral-800">
            Post New Circular
          </h2>
          <p className="text-neutral-500 mt-1">
            Upload a headline, issue date, and file (PDF, JPG, or PNG).
          </p>
        </header>

        <form onSubmit={handleSubmit} className="p-6 flex-1">
          <div className="space-y-6">
            <AnimatedInput
              id="headline"
              label="Circular Headline"
              value={headline}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setHeadline(e.target.value)
              }
              disabled={isBusy}
              autoFocus={true}
            />

            {/* Circular Issue Date — popover calendar (react-day-picker) */}
            <div className="relative pt-4" ref={calendarRef}>
              <span className="absolute left-0 -top-1.5 text-sm text-primary-600 font-medium">
                Circular Date
              </span>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setIsCalendarOpen((o) => !o)}
                className="w-full flex items-center justify-between bg-transparent px-2 py-1 text-lg tracking-wide text-neutral-800 font-mono border-b-2 border-neutral-400 focus:outline-none focus:border-primary-600 disabled:bg-neutral-100 disabled:border-neutral-200 disabled:cursor-not-allowed"
              >
                <span
                  className={publishedDate ? "text-neutral-800" : "text-neutral-400"}
                >
                  {publishedDate
                    ? publishedDate.toFormat("dd LLL yyyy")
                    : "Select the circular's issue date"}
                </span>
                <CalendarIcon size={18} className="text-neutral-400" />
              </button>

              <AnimatePresence>
                {isCalendarOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute z-30 mt-2 left-0"
                  >
                    <DayPicker
                      mode="single"
                      captionLayout="dropdown"
                      fromYear={2000}
                      toYear={today.year}
                      selected={publishedDate?.toJSDate()}
                      // Block future dates — a circular can't be issued later than today.
                      disabled={{ after: today.toJSDate() }}
                      defaultMonth={(publishedDate ?? today).toJSDate()}
                      onSelect={(d) => {
                        if (d) {
                          setPublishedDate(DateTime.fromJSDate(d).startOf("day"));
                          setIsCalendarOpen(false);
                        }
                      }}
                      classNames={dayPickerClassNames}
                      components={{
                        IconLeft: () => <ChevronLeft className="h-5 w-5" />,
                        IconRight: () => <ChevronRight className="h-5 w-5" />,
                      }}
                      weekStartsOn={0}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-300 ${isDragActive ? "border-primary-600 bg-primary-50" : "border-neutral-300 hover:border-primary-400"}`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center text-neutral-500">
                <UploadCloud size={48} className="mb-4 text-neutral-400" />
                {isDragActive ? (
                  <p className="text-lg font-semibold text-primary-600">
                    Drop the file here ...
                  </p>
                ) : (
                  <p>Drag & drop a file here, or click to select</p>
                )}
                <p className="text-sm mt-1">PDF, PNG, JPG up to 15MB</p>
              </div>
            </div>

            <AnimatePresence>
              {file && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                >
                  <div className="border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {preview ? (
                        <img
                          src={preview}
                          alt="Preview"
                          className="h-12 w-12 object-cover rounded"
                        />
                      ) : (
                        <File className="h-10 w-10 text-neutral-500" />
                      )}
                      <div>
                        <p className="font-semibold text-neutral-700 truncate max-w-xs">
                          {file.name}
                        </p>
                        <p className="text-sm text-neutral-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    {status !== "idle" && (
                      <div className="w-1/3">
                        {status === "uploading" && (
                          <div className="w-full bg-neutral-200 rounded-full h-2.5">
                            <motion.div
                              className="bg-primary-600 h-2.5 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        )}
                        {status === "success" && (
                          <CheckCircle className="text-green-500" />
                        )}
                        {status === "error" && (
                          <AlertCircle className="text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {status === "error" && (
              <p className="text-sm text-red-600 text-center">{errorMessage}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600 text-center">
                Upload successful! Closing soon...
              </p>
            )}
          </div>

          <div className="flex justify-end pt-8 mt-auto">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-semibold text-neutral-700 bg-transparent rounded-md hover:bg-neutral-200 transition-colors"
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ml-3 px-6 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              disabled={!file || !headline || !publishedDate || isBusy}
            >
              {status === "uploading" ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : null}
              {status === "uploading" ? "Posting..." : "Post Circular"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
