using System.Text.Json;
using System.Text.Json.Serialization;
using Teigha.DatabaseServices;
using Teigha.Runtime;

// ---------------------------------------------------------------------------
// JSON contract
// ---------------------------------------------------------------------------

internal sealed record ConvertRequest(
    [property: JsonPropertyName("action")]   string Action,
    [property: JsonPropertyName("dwg_path")] string DwgPath
);

internal sealed record ConvertResponse(
    [property: JsonPropertyName("status")]  string  Status,
    [property: JsonPropertyName("dxf")]     string? Dxf     = null,
    [property: JsonPropertyName("message")] string? Message = null
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

static void WriteResponse(ConvertResponse resp) =>
    Console.WriteLine(JsonSerializer.Serialize(resp));

var line = Console.ReadLine();
if (string.IsNullOrWhiteSpace(line))
{
    WriteResponse(new ConvertResponse("error", Message: "No input received on stdin."));
    return 1;
}

ConvertRequest? req;
try
{
    req = JsonSerializer.Deserialize<ConvertRequest>(line);
}
catch (JsonException ex)
{
    WriteResponse(new ConvertResponse("error", Message: $"JSON parse error: {ex.Message}"));
    return 1;
}

if (req is null || req.Action != "convert" || string.IsNullOrWhiteSpace(req.DwgPath))
{
    WriteResponse(new ConvertResponse(
        "error",
        Message: "Invalid request — expected {\"action\":\"convert\",\"dwg_path\":\"...\"}"));
    return 1;
}

if (!File.Exists(req.DwgPath))
{
    WriteResponse(new ConvertResponse("error", Message: $"File not found: {req.DwgPath}"));
    return 1;
}

var tempDxf = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.dxf");
try
{
    // Initialize the ODA runtime. Services must remain alive for the duration of any
    // Database operation; disposing it shuts the ODA subsystem down cleanly.
    using var services = new Services();

    using var db = new Database(false, true);
    db.ReadDwgFile(req.DwgPath, FileOpenMode.OpenForReadAndWriteNoShare, false, "");
    db.DxfOut(tempDxf, 16, DwgVersion.vAC21);

    var dxfContent = File.ReadAllText(tempDxf);
    WriteResponse(new ConvertResponse("ok", Dxf: dxfContent));
    return 0;
}
catch (Exception ex)
{
    WriteResponse(new ConvertResponse("error", Message: ex.Message));
    return 1;
}
finally
{
    if (File.Exists(tempDxf))
        File.Delete(tempDxf);
}
