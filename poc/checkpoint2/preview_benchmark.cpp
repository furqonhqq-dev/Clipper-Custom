// M0 Checkpoint 2: two-layer libopenshot frame extraction / seek benchmark.
// This is NOT an interactive realtime preview or Rust/Tauri integration.
#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
#include "Clip.h"
#include "FFmpegWriter.h"
#include "Frame.h"
#include "Settings.h"
#include "Timeline.h"

using Clock = std::chrono::steady_clock;
static double milliseconds(Clock::time_point a, Clock::time_point b) {
    return std::chrono::duration<double, std::milli>(b - a).count();
}
static void save_frame(openshot::Timeline& timeline, int frame,
                       const std::filesystem::path& folder) {
    auto result = timeline.GetFrame(frame);
    if (!result) throw std::runtime_error("No frame at " + std::to_string(frame));
    result->Save((folder / ("preview_" + std::to_string(frame) + ".png")).string(),
                 1.0f, "PNG", 100);
}
int main(int argc, char** argv) {
    if (argc != 4) {
        std::cerr << "Usage: preview_benchmark <background.mp4> <overlay.mp4> <output-dir>\n";
        return 2;
    }
    try {
        const std::filesystem::path out(argv[3]);
        std::filesystem::create_directories(out);
        openshot::Settings::Instance()->HARDWARE_DECODER = 0;
        openshot::Clip bg{std::string(argv[1])};
        openshot::Clip ov{std::string(argv[2])};
        bg.Layer(0); bg.Position(0.0); bg.Start(0.0); bg.End(2.0);
        ov.Layer(1); ov.Position(0.0); ov.Start(0.0); ov.End(2.0);
        ov.alpha.AddPoint(1, 0.5);
        openshot::Timeline timeline(
            640, 360, openshot::Fraction(30, 1),
            48000, 2, openshot::ChannelLayout::LAYOUT_STEREO);
        timeline.AddClip(&bg);
        timeline.AddClip(&ov);
        timeline.Open();

        // Warm up decoding and caches; record timings for frames 1..60.
        (void)timeline.GetFrame(1);
        std::vector<double> sequential_ms;
        auto seq_start = Clock::now();
        for (int n = 1; n <= 60; ++n) {
            auto start = Clock::now();
            auto frame = timeline.GetFrame(n);
            auto end = Clock::now();
            if (!frame) throw std::runtime_error("Null sequential frame");
            sequential_ms.push_back(milliseconds(start, end));
        }
        double sequential_wall_ms = milliseconds(seq_start, Clock::now());

        // Capture samples separately; image compression is excluded from timing.
        for (int n : {1, 15, 30, 45, 60}) save_frame(timeline, n, out);

        // Alternating seeks on the SAME opened timeline (warm cache).
        const std::vector<int> seek_frames = {30, 1, 60, 15, 45, 5, 55, 20, 40, 10, 50, 25};
        std::vector<double> seek_ms;
        for (int n : seek_frames) {
            auto start = Clock::now();
            auto frame = timeline.GetFrame(n);
            auto end = Clock::now();
            if (!frame) throw std::runtime_error("Null seek frame");
            seek_ms.push_back(milliseconds(start, end));
        }

        auto render_start = Clock::now();
        openshot::FFmpegWriter writer{(out / "export.mp4").string()};
        writer.SetVideoOptions(
            true, "mpeg4", openshot::Fraction(30, 1),
            640, 360, openshot::Fraction(1, 1),
            false, false, 1200000);
        writer.SetAudioOptions(
            true, "aac", 48000, 2,
            openshot::ChannelLayout::LAYOUT_STEREO, 128000);
        writer.Open();
        writer.WriteFrame(&timeline, 1, 60);
        writer.Close();
        double export_ms = milliseconds(render_start, Clock::now());
        timeline.Close();

        std::ofstream report(out / "timings.json");
        if (!report) throw std::runtime_error("Cannot write timing report");
        report << std::fixed << std::setprecision(3);
        report << "{\n  \"engine\": \"libopenshot-native\",\n"
               << "  \"resolution\": \"640x360\",\n"
               << "  \"frame_count\": 60,\n"
               << "  \"sequential_wall_ms\": " << sequential_wall_ms << ",\n"
               << "  \"export_ms\": " << export_ms << ",\n"
               << "  \"sequential_frame_ms\": [";
        for (size_t i=0; i<sequential_ms.size(); ++i)
            report << (i ? ", " : "") << sequential_ms[i];
        report << "],\n  \"seek_frame_numbers\": [";
        for (size_t i=0; i<seek_frames.size(); ++i)
            report << (i ? ", " : "") << seek_frames[i];
        report << "],\n  \"seek_ms\": [";
        for (size_t i=0; i<seek_ms.size(); ++i)
            report << (i ? ", " : "") << seek_ms[i];
        report << "]\n}\n";
        report.close();
        std::cout << "CHECKPOINT2_LIBOPENSHOT_COMPLETE\n";
        return 0;
    } catch (const std::exception& ex) {
        std::cerr << "Checkpoint2 libopenshot error: " << ex.what() << "\n";
        return 1;
    }
}
