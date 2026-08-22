using System.Runtime.InteropServices;
using Extism;

namespace AmllPluginCsharpPdk;

public static class Functions
{
    [UnmanagedCallersOnly(EntryPoint = "echo_json")]
    public static int EchoJson()
    {
        Pdk.SetOutput(Pdk.GetInputString());
        return 0;
    }
}

public static class Program
{
    public static void Main()
    {
    }
}
