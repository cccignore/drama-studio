"use client";
import * as React from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({
  onTranscript,
  disabled,
  lang = "zh-CN",
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  lang?: string;
}) {
  const [listening, setListening] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const recRef = React.useRef<SpeechRecognitionInstance | null>(null);

  React.useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  const start = () => {
    const Ctor = getCtor();
    if (!Ctor) {
      toast.error("当前浏览器不支持语音输入，建议使用 Chrome / Edge");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (evt) => {
      let text = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        text += evt.results[i][0].transcript;
      }
      onTranscript(text);
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  if (!supported) {
    return (
      <Button type="button" variant="ghost" size="icon" disabled title="浏览器不支持语音输入">
        <MicOff className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={listening ? "primary" : "secondary"}
      size="icon"
      disabled={disabled}
      onClick={listening ? stop : start}
      title={listening ? "停止语音输入" : "开始语音输入"}
    >
      <Mic className={listening ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
    </Button>
  );
}
