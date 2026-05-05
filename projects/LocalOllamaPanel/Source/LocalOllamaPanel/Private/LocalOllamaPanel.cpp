#include "LocalOllamaPanel.h"

#include "Dom/JsonObject.h"
#include "Framework/Docking/TabManager.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "JsonObjectConverter.h"
#include "LevelEditor.h"
#include "Misc/DateTime.h"
#include "Misc/Timespan.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "ToolMenus.h"
#include "Widgets/Docking/SDockTab.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SMultiLineEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "FLocalOllamaPanelModule"

static const FName LocalOllamaPanelTabName(TEXT("LocalOllamaPanel"));

namespace LocalOllamaPanel
{
    static FString JsonStringField(const TSharedPtr<FJsonObject>& Obj, const FString& FieldName, const FString& Fallback = TEXT(""))
    {
        if (!Obj.IsValid())
        {
            return Fallback;
        }

        FString Value;
        return Obj->TryGetStringField(FieldName, Value) ? Value : Fallback;
    }

    static FString SecondsString(double Seconds)
    {
        return FString::Printf(TEXT("%.2fs"), Seconds);
    }
}

class SLocalOllamaPanelWidget final : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SLocalOllamaPanelWidget) {}
    SLATE_END_ARGS()

    void Construct(const FArguments& InArgs)
    {
        Endpoint = TEXT("http://127.0.0.1:11434/api/generate");
        ModelName = TEXT("qwen2.5-coder:1.5b");
        Status = TEXT("idle");
        ResponseText = TEXT("Ready. This panel is read-only: it sends text to Ollama and displays the answer only.");
        ResponseTime = TEXT("-");
        LastChecked = TEXT("never");
        bUseFallbackOnError = false;
        bRequestInFlight = false;

        ChildSlot
        [
            SNew(SBorder)
            .Padding(12)
            [
                SNew(SScrollBox)
                + SScrollBox::Slot()
                [
                    SNew(SVerticalBox)

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 8)
                    [
                        SNew(STextBlock)
                        .Text(LOCTEXT("Title", "Local Ollama Panel"))
                        .Font(FCoreStyle::GetDefaultFontStyle("Bold", 18))
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 14)
                    [
                        SNew(STextBlock)
                        .Text(LOCTEXT("Subtitle", "Read-only editor panel. No commands. No asset edits. No sneaky gremlins."))
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 6)
                    [
                        SNew(STextBlock).Text(LOCTEXT("EndpointLabel", "Endpoint"))
                    ]
                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 10)
                    [
                        SAssignNew(EndpointBox, SEditableTextBox)
                        .Text(this, &SLocalOllamaPanelWidget::GetEndpointText)
                        .OnTextCommitted(this, &SLocalOllamaPanelWidget::OnEndpointCommitted)
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 6)
                    [
                        SNew(STextBlock).Text(LOCTEXT("ModelLabel", "Model"))
                    ]
                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 10)
                    [
                        SAssignNew(ModelBox, SEditableTextBox)
                        .Text(this, &SLocalOllamaPanelWidget::GetModelText)
                        .OnTextCommitted(this, &SLocalOllamaPanelWidget::OnModelCommitted)
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 6)
                    [
                        SNew(STextBlock).Text(LOCTEXT("PromptLabel", "Prompt"))
                    ]
                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .MinHeight(110)
                    .Padding(0, 0, 0, 10)
                    [
                        SAssignNew(PromptBox, SMultiLineEditableTextBox)
                        .Text(LOCTEXT("DefaultPrompt", "Say hello from the local model and confirm you are running through Ollama."))
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 10)
                    [
                        SNew(SHorizontalBox)
                        + SHorizontalBox::Slot()
                        .AutoWidth()
                        .Padding(0, 0, 8, 0)
                        [
                            SNew(SButton)
                            .Text(this, &SLocalOllamaPanelWidget::GetSendButtonText)
                            .IsEnabled(this, &SLocalOllamaPanelWidget::CanSend)
                            .OnClicked(this, &SLocalOllamaPanelWidget::OnSendClicked)
                        ]
                        + SHorizontalBox::Slot()
                        .AutoWidth()
                        .VAlign(VAlign_Center)
                        .Padding(0, 0, 8, 0)
                        [
                            SNew(SCheckBox)
                            .IsChecked(this, &SLocalOllamaPanelWidget::GetFallbackCheckState)
                            .OnCheckStateChanged(this, &SLocalOllamaPanelWidget::OnFallbackCheckChanged)
                            [
                                SNew(STextBlock).Text(LOCTEXT("FallbackCheck", "Use deterministic fallback on error"))
                            ]
                        ]
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 10)
                    [
                        SNew(SSeparator)
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 8)
                    [
                        SNew(SGridPanel)
                        + SGridPanel::Slot(0, 0).Padding(0, 0, 10, 4)[SNew(STextBlock).Text(LOCTEXT("StatusLabel", "Status")).Font(FCoreStyle::GetDefaultFontStyle("Bold", 10))]
                        + SGridPanel::Slot(1, 0).Padding(0, 0, 0, 4)[SNew(STextBlock).Text(this, &SLocalOllamaPanelWidget::GetStatusText)]
                        + SGridPanel::Slot(0, 1).Padding(0, 0, 10, 4)[SNew(STextBlock).Text(LOCTEXT("ModelOutLabel", "Model returned")).Font(FCoreStyle::GetDefaultFontStyle("Bold", 10))]
                        + SGridPanel::Slot(1, 1).Padding(0, 0, 0, 4)[SNew(STextBlock).Text(this, &SLocalOllamaPanelWidget::GetReturnedModelText)]
                        + SGridPanel::Slot(0, 2).Padding(0, 0, 10, 4)[SNew(STextBlock).Text(LOCTEXT("TimeLabel", "Response time")).Font(FCoreStyle::GetDefaultFontStyle("Bold", 10))]
                        + SGridPanel::Slot(1, 2).Padding(0, 0, 0, 4)[SNew(STextBlock).Text(this, &SLocalOllamaPanelWidget::GetResponseTimeText)]
                        + SGridPanel::Slot(0, 3).Padding(0, 0, 10, 4)[SNew(STextBlock).Text(LOCTEXT("CheckedLabel", "Last checked")).Font(FCoreStyle::GetDefaultFontStyle("Bold", 10))]
                        + SGridPanel::Slot(1, 3).Padding(0, 0, 0, 4)[SNew(STextBlock).Text(this, &SLocalOllamaPanelWidget::GetLastCheckedText)]
                    ]

                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .Padding(0, 0, 0, 6)
                    [
                        SNew(STextBlock).Text(LOCTEXT("ResponseLabel", "Response"))
                    ]
                    + SVerticalBox::Slot()
                    .AutoHeight()
                    .MinHeight(220)
                    [
                        SAssignNew(ResponseBox, SMultiLineEditableTextBox)
                        .Text(this, &SLocalOllamaPanelWidget::GetResponseText)
                        .IsReadOnly(true)
                    ]
                ]
            ]
        ];
    }

private:
    TSharedPtr<SEditableTextBox> EndpointBox;
    TSharedPtr<SEditableTextBox> ModelBox;
    TSharedPtr<SMultiLineEditableTextBox> PromptBox;
    TSharedPtr<SMultiLineEditableTextBox> ResponseBox;

    FString Endpoint;
    FString ModelName;
    FString ReturnedModelName;
    FString Status;
    FString ResponseText;
    FString ResponseTime;
    FString LastChecked;
    double RequestStartSeconds = 0.0;
    bool bUseFallbackOnError = false;
    bool bRequestInFlight = false;

    FText GetEndpointText() const { return FText::FromString(Endpoint); }
    FText GetModelText() const { return FText::FromString(ModelName); }
    FText GetReturnedModelText() const { return FText::FromString(ReturnedModelName.IsEmpty() ? TEXT("-") : ReturnedModelName); }
    FText GetStatusText() const { return FText::FromString(Status); }
    FText GetResponseText() const { return FText::FromString(ResponseText); }
    FText GetResponseTimeText() const { return FText::FromString(ResponseTime); }
    FText GetLastCheckedText() const { return FText::FromString(LastChecked); }
    FText GetSendButtonText() const { return bRequestInFlight ? LOCTEXT("Sending", "Sending...") : LOCTEXT("Send", "Send to Ollama"); }
    bool CanSend() const { return !bRequestInFlight; }

    ECheckBoxState GetFallbackCheckState() const
    {
        return bUseFallbackOnError ? ECheckBoxState::Checked : ECheckBoxState::Unchecked;
    }

    void OnFallbackCheckChanged(ECheckBoxState NewState)
    {
        bUseFallbackOnError = NewState == ECheckBoxState::Checked;
    }

    void OnEndpointCommitted(const FText& NewText, ETextCommit::Type CommitType)
    {
        Endpoint = NewText.ToString().TrimStartAndEnd();
    }

    void OnModelCommitted(const FText& NewText, ETextCommit::Type CommitType)
    {
        ModelName = NewText.ToString().TrimStartAndEnd();
    }

    FReply OnSendClicked()
    {
        SendPrompt();
        return FReply::Handled();
    }

    void SetStatus(const FString& NewStatus, const FString& NewResponseText)
    {
        Status = NewStatus;
        ResponseText = NewResponseText;
        LastChecked = FDateTime::Now().ToString(TEXT("%Y-%m-%d %H:%M:%S"));
    }

    void SendPrompt()
    {
        const FString Prompt = PromptBox.IsValid() ? PromptBox->GetText().ToString() : TEXT("");
        if (Endpoint.IsEmpty() || ModelName.IsEmpty() || Prompt.TrimStartAndEnd().IsEmpty())
        {
            SetStatus(TEXT("error"), TEXT("Endpoint, model, and prompt are required."));
            return;
        }

        bRequestInFlight = true;
        ReturnedModelName = TEXT("");
        ResponseTime = TEXT("-");
        SetStatus(TEXT("sending"), TEXT("Waiting for local Ollama response..."));
        RequestStartSeconds = FPlatformTime::Seconds();

        TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
        Payload->SetStringField(TEXT("model"), ModelName);
        Payload->SetStringField(TEXT("prompt"), Prompt);
        Payload->SetBoolField(TEXT("stream"), false);

        FString PayloadString;
        const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&PayloadString);
        FJsonSerializer::Serialize(Payload.ToSharedRef(), Writer);

        TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
        Request->SetURL(Endpoint);
        Request->SetVerb(TEXT("POST"));
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
        Request->SetContentAsString(PayloadString);
        Request->OnProcessRequestComplete().BindSP(this, &SLocalOllamaPanelWidget::OnRequestComplete);

        if (!Request->ProcessRequest())
        {
            bRequestInFlight = false;
            HandleFailure(TEXT("Unreal could not start the HTTP request."));
        }
    }

    void OnRequestComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
    {
        bRequestInFlight = false;
        const double Elapsed = FPlatformTime::Seconds() - RequestStartSeconds;
        ResponseTime = LocalOllamaPanel::SecondsString(Elapsed);

        if (!bWasSuccessful || !Response.IsValid())
        {
            HandleFailure(TEXT("No valid HTTP response from Ollama. Is Ollama running on 127.0.0.1:11434?"));
            return;
        }

        const int32 Code = Response->GetResponseCode();
        const FString Body = Response->GetContentAsString();

        if (Code < 200 || Code >= 300)
        {
            HandleFailure(FString::Printf(TEXT("HTTP %d from Ollama. Body:\n%s"), Code, *Body));
            return;
        }

        TSharedPtr<FJsonObject> Json;
        const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
        if (!FJsonSerializer::Deserialize(Reader, Json) || !Json.IsValid())
        {
            HandleFailure(FString::Printf(TEXT("Ollama returned non-JSON or unreadable JSON:\n%s"), *Body.Left(2000)));
            return;
        }

        ReturnedModelName = LocalOllamaPanel::JsonStringField(Json, TEXT("model"), ModelName);
        const FString OllamaResponse = LocalOllamaPanel::JsonStringField(Json, TEXT("response"), TEXT(""));
        bool bDone = false;
        Json->TryGetBoolField(TEXT("done"), bDone);

        FString FinalText = OllamaResponse;
        if (FinalText.IsEmpty())
        {
            FinalText = TEXT("Ollama returned success but no `response` field content.");
        }

        FinalText += FString::Printf(TEXT("\n\n---\nprovenance:\n  endpoint: %s\n  requested_model: %s\n  returned_model: %s\n  status: live\n  done: %s\n  response_time: %s\n  asset_edits: false\n  command_execution: false"),
            *Endpoint,
            *ModelName,
            *ReturnedModelName,
            bDone ? TEXT("true") : TEXT("false"),
            *ResponseTime);

        SetStatus(TEXT("live"), FinalText);
    }

    void HandleFailure(const FString& ErrorMessage)
    {
        ReturnedModelName = TEXT("-");

        if (bUseFallbackOnError)
        {
            SetStatus(TEXT("fallback"), FString::Printf(
                TEXT("Deterministic fallback response. Local model call failed.\n\nerror: %s\n\nNo commands were executed. No assets were edited. Check Ollama boot dependencies, model install, and endpoint."),
                *ErrorMessage));
            return;
        }

        SetStatus(TEXT("error"), FString::Printf(
            TEXT("Local model call failed.\n\n%s\n\nNo fallback was used. No commands were executed. No assets were edited."),
            *ErrorMessage));
    }
};

void FLocalOllamaPanelModule::StartupModule()
{
    FGlobalTabmanager::Get()->RegisterNomadTabSpawner(LocalOllamaPanelTabName, FOnSpawnTab::CreateRaw(this, &FLocalOllamaPanelModule::OnSpawnPluginTab))
        .SetDisplayName(LOCTEXT("LocalOllamaPanelTabTitle", "Local Ollama"))
        .SetMenuType(ETabSpawnerMenuType::Hidden);

    UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FLocalOllamaPanelModule::RegisterMenus));
}

void FLocalOllamaPanelModule::ShutdownModule()
{
    UToolMenus::UnRegisterStartupCallback(this);
    UToolMenus::UnregisterOwner(this);
    FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(LocalOllamaPanelTabName);
}

TSharedRef<SDockTab> FLocalOllamaPanelModule::OnSpawnPluginTab(const FSpawnTabArgs& SpawnTabArgs)
{
    return SNew(SDockTab)
        .TabRole(ETabRole::NomadTab)
        [
            SNew(SLocalOllamaPanelWidget)
        ];
}

void FLocalOllamaPanelModule::PluginButtonClicked()
{
    FGlobalTabmanager::Get()->TryInvokeTab(LocalOllamaPanelTabName);
}

void FLocalOllamaPanelModule::RegisterMenus()
{
    FToolMenuOwnerScoped OwnerScoped(this);

    UToolMenu* Menu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.Tools");
    FToolMenuSection& Section = Menu->FindOrAddSection("LocalOllamaPanel");
    Section.AddMenuEntry(
        "OpenLocalOllamaPanel",
        LOCTEXT("OpenLocalOllamaPanel", "Local Ollama Panel"),
        LOCTEXT("OpenLocalOllamaPanelTooltip", "Open the read-only local Ollama prompt panel."),
        FSlateIcon(),
        FUIAction(FExecuteAction::CreateRaw(this, &FLocalOllamaPanelModule::PluginButtonClicked))
    );
}

IMPLEMENT_MODULE(FLocalOllamaPanelModule, LocalOllamaPanel)

#undef LOCTEXT_NAMESPACE
