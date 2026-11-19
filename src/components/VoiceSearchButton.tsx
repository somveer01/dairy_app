import React, { useState, useRef, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  View
} from 'react-native';
import { showAlert } from '../utils/alertUtils';

interface VoiceSearchButtonProps {
  onResult: (text: string) => void;
  lang?: 'en' | 'hi';
  size?: number;
}

export const VoiceSearchButton: React.FC<VoiceSearchButtonProps> = ({
  onResult,
  lang = 'hi',
  size = 38
}) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const handleVoiceSearch = () => {
    if (Platform.OS !== 'web' && typeof window === 'undefined') {
      showAlert(
        lang === 'hi' ? 'वॉइस सर्च' : 'Voice Search',
        lang === 'hi'
          ? 'वॉइस सर्च वेब ब्राउज़र (Chrome) में समर्थित है।'
          : 'Voice search is supported in Chrome browser.'
      );
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showAlert(
        lang === 'hi' ? 'वॉइस सर्च समर्थित नहीं' : 'Voice Search Not Supported',
        lang === 'hi'
          ? 'आपके ब्राउज़र में वॉइस सर्च उपलब्ध नहीं है। कृपया Google Chrome का उपयोग करें।'
          : 'Voice search is not supported in this browser. Please use Google Chrome.'
      );
      return;
    }

    // If currently listening, stop it
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      // Use Hindi (India) as primary voice recognition language for Indian names
      recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        setIsListening(false);
        if (event.results && event.results[0] && event.results[0][0]) {
          let transcript = event.results[0][0].transcript || '';
          // Remove trailing punctuation if added by speech engine
          transcript = transcript.replace(/[.,?!]+$/, '').trim();
          if (transcript) {
            onResult(transcript);
          }
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        const error = event.error;
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          showAlert(
            lang === 'hi' ? 'माइक की अनुमति दें' : 'Microphone Permission Required',
            lang === 'hi'
              ? 'कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति (Permission) दें ताकि आप बोलकर नाम खोज सकें।'
              : 'Please allow microphone access in browser settings to use voice search.'
          );
        } else if (error !== 'no-speech' && error !== 'aborted') {
          console.warn('Speech recognition error:', error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e: any) {
      setIsListening(false);
      console.warn('Could not start speech recognition:', e);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        isListening && styles.buttonActive
      ]}
      onPress={handleVoiceSearch}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={lang === 'hi' ? 'बोलकर खोजें' : 'Voice Search'}
    >
      {isListening ? (
        <View style={styles.listeningContainer}>
          <ActivityIndicator size="small" color="#ef4444" />
        </View>
      ) : (
        <Text style={styles.micIcon}>🎙️</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  buttonActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444'
  },
  micIcon: {
    fontSize: 16
  },
  listeningContainer: {
    alignItems: 'center',
    justifyContent: 'center'
  }
});
