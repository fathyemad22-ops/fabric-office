package com.fabricoffice.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.Charset;

/**
 * تطبيق نظام مكتب القماش: بيفتح السيستم المنشور على GitHub Pages جوه التطبيق،
 * وبيوصّل الحاجات اللي المتصفح العادي بيعملها: واتساب، الطباعة، حفظ النسخة الاحتياطية، واختيار ملف.
 */
public class MainActivity extends Activity {
    static final String APP_URL = "https://fathyemad22-ops.github.io/fabric-office/fabric-office/";
    static final String APP_HOST = "fathyemad22-ops.github.io";
    static final int REQ_PICK_FILE = 1;
    static final int REQ_SAVE_FILE = 2;

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    String pendingSaveText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " FabricOfficeApp/1.0");
        s.setCacheMode(isOnline() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.startsWith(APP_URL)) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // window.open (زي روابط واتساب) → نفتحه برة التطبيق
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView temp = new WebView(MainActivity.this);
                temp.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        openExternal(url);
                        v.destroy();
                        return true;
                    }

                    @Override
                    public void onPageStarted(WebView v, String url, Bitmap favicon) {
                        openExternal(url);
                        v.stopLoading();
                        v.destroy();
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(temp);
                resultMsg.sendToTarget();
                return true;
            }

            // اختيار ملف (استرجاع النسخة الاحتياطية)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                boolean images = types != null && types.length > 0 && types[0] != null && types[0].startsWith("image");
                i.setType(images ? "image/*" : "*/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "اختار الملف"), REQ_PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(APP_URL);
    }

    boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
        return n != null && n.isConnected();
    }

    void showOffline() {
        web.loadUrl("file:///android_res/raw/offline.html");
    }

    /** روابط السيستم نفسه تفتح جوه التطبيق، وأي حاجة تانية (واتساب، تليفون...) تفتح برة */
    boolean handleUrl(String url) {
        Uri u = Uri.parse(url);
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if ((scheme.equals("https") || scheme.equals("http")) && APP_HOST.equals(u.getHost())) return false;
        if (scheme.equals("file")) return false;
        openExternal(url);
        return true;
    }

    void openExternal(String url) {
        try {
            Intent i;
            if (url.startsWith("intent:")) i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            else i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "مفيش تطبيق يفتح الرابط ده", Toast.LENGTH_SHORT).show();
        }
    }

    /** الحاجات اللي صفحة السيستم بتطلبها من التطبيق */
    class Bridge {
        @JavascriptInterface
        public void print() {
            runOnUiThread(new Runnable() {
                public void run() {
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    if (pm != null) pm.print("مكتب القماش", web.createPrintDocumentAdapter("fabric-office"), null);
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSaveText = text;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE_FILE);
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "مقدرتش أفتح مكان الحفظ", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(new Runnable() {
                public void run() {
                    web.getSettings().setCacheMode(isOnline() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
                    web.loadUrl(APP_URL);
                }
            });
        }

        @JavascriptInterface
        public boolean isApp() {
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        result = new Uri[n];
                        for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
                    } else if (data.getData() != null) {
                        result = new Uri[] { data.getData() };
                    }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        if (requestCode == REQ_SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSaveText != null) {
                try {
                    OutputStream out = getContentResolver().openOutputStream(data.getData());
                    out.write(pendingSaveText.getBytes(Charset.forName("UTF-8")));
                    out.close();
                    Toast.makeText(this, "تم حفظ النسخة الاحتياطية", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "حصلت مشكلة في الحفظ", Toast.LENGTH_SHORT).show();
                }
            }
            pendingSaveText = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // زرار الرجوع: يقفل النافذة المفتوحة الأول، وبعدين يرجع للشاشة اللي قبلها
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__androidBack && window.__androidBack()) ? '1' : '0'", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (handled != null && handled.contains("1")) return;
                if (web.canGoBack()) web.goBack();
                else MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
