using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;

// Register all command-bearing classes with AutoCAD on NETLOAD. Without
// this attribute the [CommandMethod] handlers in `Commands` are not
// discovered by accoreconsole.
//
// Namespace is `Chamber19.BlockLibrary.AcadPlugin` (not `BlockLibrary.*`)
// because Acmgd.dll exports a top-level type called `BlockLibrary` —
// using it as our root namespace produces a CS0435 conflict warning.
[assembly: CommandClass(typeof(Chamber19.BlockLibrary.AcadPlugin.Commands))]

namespace Chamber19.BlockLibrary.AcadPlugin
{
    /// <summary>
    /// Commands exposed to AutoCAD by the block-library .NET plugin.
    ///
    /// Loaded into accoreconsole.exe via NETLOAD. The Tauri Rust shell
    /// generates a one-shot .scr script that NETLOADs this assembly,
    /// invokes <c>BLDWG2DXF</c> with input + output paths, and reads the
    /// resulting DXF file.
    ///
    /// Conventions (per Chamber 19 AUTOCAD_DOTNET.md):
    ///   - Database operations live inside a Transaction when reading or
    ///     writing entities. The current conversion path uses Database-
    ///     level methods only (ReadDwgFile / DxfOut), which do not require
    ///     a transaction wrapper.
    ///   - Open existing objects ForRead first; UpgradeOpen() only when
    ///     modifying. Not applicable here yet — future block-attribute
    ///     extraction commands MUST follow this rule.
    ///   - Headless host: <see cref="Database(bool, bool)"/> with
    ///     <c>buildDefaultDrawing: false</c> and <c>noDocument: true</c>.
    ///   - Never use COM from a .NET plugin (skill file forbids it). Pure
    ///     managed API.
    ///
    /// Result protocol — every command writes exactly one of the following
    /// markers to the Editor (which surfaces on accoreconsole's stdout):
    ///   <c>BL_OK: &lt;message&gt;</c>
    ///   <c>BL_ERROR: &lt;message&gt;</c>
    /// The Rust caller parses these markers; anything else is noise.
    /// </summary>
    public class Commands
    {
        // -------------------------------------------------------------------
        // BLDWG2DXF — convert a DWG on disk to a DXF on disk.
        //
        // CommandFlags.Session = run on the application thread (no document
        // context required, even though accoreconsole always has one open).
        // CommandFlags.NoUndoMarker = we never modify the active document, so
        // no undo stack pollution.
        // -------------------------------------------------------------------
        [CommandMethod("BLDWG2DXF", CommandFlags.Session | CommandFlags.NoUndoMarker)]
        public void ConvertDwgToDxf()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                // Skip — no editor to write to anyway.
                return;
            }

            var ed = doc.Editor;

            string inputPath;
            string outputPath;
            try
            {
                inputPath = ReadPathPrompt(ed, "\nInput DWG path: ");
                outputPath = ReadPathPrompt(ed, "\nOutput DXF path: ");
            }
            catch (PromptCanceledException ex)
            {
                ed.WriteMessage($"\nBL_ERROR: {ex.Message}\n");
                return;
            }

            try
            {
                // Headless conversion — does not touch the active document.
                using (var db = new Database(false, true))
                {
                    db.ReadDwgFile(inputPath, FileOpenMode.OpenForReadAndAllShare, false, "");
                    // DwgVersion.AC1027 = AutoCAD 2013 DXF format. Widely
                    // supported by Three.js DXF parsers; precision 16 keeps
                    // full double precision in numeric groups.
                    db.DxfOut(outputPath, 16, DwgVersion.AC1027);
                }
                ed.WriteMessage($"\nBL_OK: {outputPath}\n");
            }
            catch (Autodesk.AutoCAD.Runtime.Exception acEx)
            {
                ed.WriteMessage($"\nBL_ERROR: ErrorStatus={acEx.ErrorStatus} {acEx.Message}\n");
            }
            catch (System.Exception ex)
            {
                ed.WriteMessage($"\nBL_ERROR: {ex.GetType().Name}: {ex.Message}\n");
            }
        }

        // -------------------------------------------------------------------
        // BLPING — health-check used by the Rust shell to verify the plugin
        // was loaded successfully before submitting a real job. Cheap; no
        // database access.
        // -------------------------------------------------------------------
        [CommandMethod("BLPING")]
        public void Ping()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null)
            {
                // Skip — no editor to write to anyway.
                return;
            }
            doc.Editor.WriteMessage("\nBL_OK: BlockLibrary.AcadPlugin alive\n");
        }

        // -------------------------------------------------------------------
        // Helpers
        // -------------------------------------------------------------------

        private static string ReadPathPrompt(Editor ed, string prompt)
        {
            // AllowSpaces is required because the OS temp dir typically lives
            // under "C:\Users\<name>\AppData\Local\Temp\" — and a username
            // with a space (very common on Windows) breaks the default
            // GetString contract that splits on whitespace.
            var opts = new PromptStringOptions(prompt) { AllowSpaces = true };
            var res = ed.GetString(opts);
            if (res.Status != PromptStatus.OK)
            {
                throw new PromptCanceledException(
                    $"prompt '{prompt.Trim()}' returned status {res.Status}");
            }
            return res.StringResult;
        }

        private class PromptCanceledException : System.Exception
        {
            public PromptCanceledException(string message) : base(message) { }
        }
    }
}
