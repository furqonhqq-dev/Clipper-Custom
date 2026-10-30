// Checkpoint 1: native libopenshot C++ smoke test (not a realtime preview).
// Synthetic inputs are generated in CI. This program must link to the actual
// native libopenshot DLL and use its Timeline + FFmpegWriter classes.
#include <exception>
#include <iostream>
#include <string>
#include "Clip.h"
#include "FFmpegWriter.h"
#include "Frame.h"
#include "Settings.h"
#include "Timeline.h"

int main(int argc, char** argv) {
    if (argc != 5) {
        std::cerr << "Usage: native_smoke <background.mp4> <overlay.mp4> <output.mp4> <frame.png>\n";
        return 2;
    }
    try {
        openshot::Settings::Instance()->HARDWARE_DECODER = 0;
        openshot::Clip background(std::string(argv[1]));
        openshot::Clip overlay(std::string(argv[2]));
        background.Layer(0);
        background.Position(0.0);
        background.Start(0.0);
        background.End(2.0);
        overlay.Layer(1);
        overlay.Position(0.0);
        overlay.Start(0.0);
        overlay.End(2.0);
        // Blending proves that the upper video layer is part of the composite.
        overlay.alpha.AddPoint(1, 0.5);

        openshot::Timeline timeline(
            320, 180, openshot::Fraction(30, 1),
            48000, 2, openshot::ChannelLayout::LAYOUT_STEREO);
        timeline.AddClip(&background);
        timeline.AddClip(&overlay);
        timeline.Open();

        auto preview_frame = timeline.GetFrame(30);
        if (!preview_frame) {
            std::cerr << "Timeline did not return frame 30\n";
            return 3;
        }
        preview_frame->Save(std::string(argv[4]), 1.0f, "PNG", 100);

        openshot::FFmpegWriter writer(std::string(argv[3]));
        // Use the broadly available native MPEG-4 Part 2 encoder for the
        // native-build feasibility test. H.264/AAC is a later P0 gate.
        writer.SetVideoOptions(
            true, "mpeg4", openshot::Fraction(30, 1),
            320, 180, openshot::Fraction(1, 1),
            false, false, 500000);
        writer.SetAudioOptions(
            true, "aac", 48000, 2,
            openshot::ChannelLayout::LAYOUT_STEREO, 128000);
        writer.Open();
        writer.WriteFrame(&timeline, 1, 60);
        writer.Close();
        timeline.Close();

        std::cout << "NATIVE_RENDER_COMPLETE\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Native libopenshot error: " << e.what() << "\n";
        return 1;
    } catch (...) {
        std::cerr << "Unknown native libopenshot error\n";
        return 1;
    }
}
