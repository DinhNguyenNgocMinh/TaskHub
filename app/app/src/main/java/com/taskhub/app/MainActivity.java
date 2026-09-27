package com.taskhub.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

public final class MainActivity extends Activity {
    private static final String APP_ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_ASSET_HOST + "/assets/index.html";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = new WebView(this);
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.getSettings().setSupportZoom(false);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        webView.addJavascriptInterface(new ChatConfigBridge(), "AndroidChatConfig");
        webView.setWebViewClient(new LocalAssetWebViewClient(assetLoader));
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    private static final class ChatConfigBridge {
        @JavascriptInterface
        public String get() {
            return "{\"supabaseUrl\":\"" + jsonEscape(BuildConfig.SUPABASE_URL)
                    + "\",\"supabaseKey\":\"" + jsonEscape(BuildConfig.SUPABASE_PUBLISHABLE_KEY) + "\"}";
        }

        private static String jsonEscape(String value) {
            return value.replace("\\", "\\\\").replace("\"", "\\\"")
                    .replace("\n", "\\n").replace("\r", "\\r");
        }
    }

    private static final class LocalAssetWebViewClient extends WebViewClient {
        private final WebViewAssetLoader assetLoader;

        LocalAssetWebViewClient(WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
        }

        @Nullable
        @Override
        public WebResourceResponse shouldInterceptRequest(
                @NonNull WebView view,
                @NonNull WebResourceRequest request
        ) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(
                @NonNull WebView view,
                @NonNull WebResourceRequest request
        ) {
            // Keep navigation inside the packaged origin; network requests are made by the chat client.
            return !APP_ASSET_HOST.equals(request.getUrl().getHost());
        }
    }
}
