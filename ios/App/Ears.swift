// The app's ears and voice. One microphone channel feeds two things at once:
//  - sound levels every hundredth of a second, each with the time it was heard, so the game can time the start of speech;
//  - Apple's on-phone speech recogniser, started afresh for each word and told which word to expect.
// The game (the web page) asks with messages {cmd: "open" | "word" | "say" | "close"} and is answered through window.__ears.
import AVFoundation
import Speech
import WebKit

final class Ears: NSObject, WKScriptMessageHandler, AVSpeechSynthesizerDelegate {
    weak var page: WKWebView?
    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-GB"))
    private let voice = AVSpeechSynthesizer()
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?   // read on the audio thread, so guarded by `lock`
    private var task: SFSpeechRecognitionTask?
    private var tapped = false

    override init() { super.init(); voice.delegate = self }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "open": open()
        case "word": listen(for: body["key"] as? String ?? "")
        case "say": say(body["text"] as? String ?? "")
        case "close": close()
        default: break
        }
    }

    private func send(_ name: String, _ args: String) {
        page?.evaluateJavaScript("window.__ears&&window.__ears.\(name)(\(args))", completionHandler: nil)
    }

    private func open() {
        SFSpeechRecognizer.requestAuthorization { status in
            AVAudioApplication.requestRecordPermission { granted in
                DispatchQueue.main.async {
                    guard status == .authorized, granted else { self.send("state", "\"not allowed\""); return }
                    do { try self.start(); self.send("state", "\"on\"") } catch { self.send("state", "\"microphone failed\"") }
                }
            }
        }
    }

    private func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
        try? session.setPreferredIOBufferDuration(0.01)
        try session.setActive(true)
        if !tapped {
            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 512, format: input.outputFormat(forBus: 0)) { [weak self] buffer, when in
                self?.hear(buffer, when)
            }
            tapped = true
            engine.prepare()
        }
        if !engine.isRunning { try engine.start() }
    }

    /// Runs on the audio thread for every chunk of sound.
    private func hear(_ buffer: AVAudioPCMBuffer, _ when: AVAudioTime) {
        lock.lock(); let current = request; lock.unlock()
        current?.append(buffer)
        guard let samples = buffer.floatChannelData?[0] else { return }
        let count = Int(buffer.frameLength), rate = buffer.format.sampleRate, step = max(1, Int(rate / 100))
        // Chunks can arrive late and in bursts, so each level carries the clock time at which it was heard.
        let clockNow = Date().timeIntervalSince1970, hostNow = AVAudioTime.seconds(forHostTime: mach_absolute_time())
        let began = when.isHostTimeValid ? clockNow - hostNow + AVAudioTime.seconds(forHostTime: when.hostTime) : clockNow - Double(count) / rate
        var levels: [String] = []
        var i = 0
        while i < count {
            let n = min(step, count - i)
            var sum: Float = 0
            for j in i..<(i + n) { sum += samples[j] * samples[j] }
            levels.append(String(format: "[%.5f,%.1f]", (sum / Float(n)).squareRoot(), (began + Double(i + n) / rate) * 1000))
            i += n
        }
        let script = "window.__ears&&window.__ears.levels([" + levels.joined(separator: ",") + "])"
        DispatchQueue.main.async { self.page?.evaluateJavaScript(script, completionHandler: nil) }
    }

    private func listen(for key: String) {
        task?.cancel(); task = nil
        guard let recognizer, recognizer.isAvailable else { send("state", "\"no speech recogniser\""); return }
        let fresh = SFSpeechAudioBufferRecognitionRequest()
        fresh.shouldReportPartialResults = true
        fresh.addsPunctuation = false
        if !key.isEmpty { fresh.contextualStrings = [key] }
        if recognizer.supportsOnDeviceRecognition { fresh.requiresOnDeviceRecognition = true }   // the sound never leaves the phone
        lock.lock(); let old = request; request = fresh; lock.unlock()
        old?.endAudio()
        var mine: SFSpeechRecognitionTask?
        mine = recognizer.recognitionTask(with: fresh) { [weak self] result, _ in
            guard let self, let result else { return }
            let texts = result.transcriptions.prefix(3).map { $0.formattedString }
            guard let data = try? JSONSerialization.data(withJSONObject: Array(texts)), let json = String(data: data, encoding: .utf8) else { return }
            let final = result.isFinal
            DispatchQueue.main.async {
                guard self.task === mine else { return }                 // a late answer about an earlier word is dropped
                self.send("text", json + "," + (final ? "true" : "false"))
            }
        }
        task = mine
    }

    private func say(_ text: String) {
        let line = AVSpeechUtterance(string: text)
        line.voice = AVSpeechSynthesisVoice(language: "en-GB")
        line.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        voice.stopSpeaking(at: .immediate)
        voice.speak(line)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.send("said", "") }
    }

    private func close() {
        task?.cancel(); task = nil
        lock.lock(); let old = request; request = nil; lock.unlock()
        old?.endAudio()
        engine.pause()
    }
}
