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

  const handleVoiceSearch = async () => {
    if (Platform.OS !== 'web' && typeof window === 'undefined') {
      showAlert(
        lang === 'hi' ? 'वॉइस सर्च' : 'Voice Search',
        lang === 'hi'
          ? 'वॉइस सर्च मोबाइल ऐप व Chrome ब्राउज़र में उपलब्ध है।'
          : 'Voice search is supported in app & Chrome browser.'
      );
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showAlert(
        lang === 'hi' ? 'वॉइस सर्च समर्थित नहीं' : 'Voice Search Not Supported',
        lang === 'hi'
          ? 'आपके डिवाइस में वॉइस सर्च समर्थित नहीं है। कृपया Google Chrome का उपयोग करें।'
          : 'Voice search is not supported on this device. Please use Google Chrome.'
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

    // Proactively request Android OS microphone permission via getUserMedia
    // This triggers the native Android system prompt: "Allow Dairy App to record audio?"
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop the temporary stream so the mic is released for speech recognition
        stream.getTracks().forEach(track => track.stop());
      } catch (err: any) {
        console.warn('Microphone permission check:', err);
        showAlert(
          lang === 'hi' ? 'माइक की अनुमति (Permission)' : 'Microphone Permission',
          lang === 'hi'
            ? 'माइक से नाम खोजने के लिए अनुमति की आवश्यकता है।\n\nकृपया अपने फ़ोन की सेटिंग्स में जाएँ:\nApps ➔ Dairy App (या Chrome) ➔ Permissions ➔ Microphone ➔ "Allow" (अनुमति दें) चुनें।'
            : 'Microphone permission is needed for voice search.\n\nPlease go to Phone Settings ➔ Apps ➔ Dairy App ➔ Permissions ➔ Microphone ➔ "Allow".'
        );
        return;
      }
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
            lang === 'hi' ? 'माइक की अनुमति (Permission)' : 'Microphone Permission',
            lang === 'hi'
              ? 'माइक से नाम खोजने के लिए अनुमति की आवश्यकता है।\n\nकृपया अपने फ़ोन की सेटिंग्स में जाएँ:\nApps ➔ Dairy App (या Chrome) ➔ Permissions ➔ Microphone ➔ "Allow" (अनुमति दें) चुनें।'
              : 'Microphone permission is needed for voice search.\n\nPlease go to Phone Settings ➔ Apps ➔ Dairy App ➔ Permissions ➔ Microphone ➔ "Allow".'
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
