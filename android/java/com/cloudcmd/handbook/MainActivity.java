package com.cloudcmd.handbook;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * CloudCmd · 云计算命令手册 —— Android 外壳。
 *
 * <p>整个网站打包在 {@code assets/www/} 里，用 WebView 加载 {@code file:///android_asset/www/index.html}。
 * 因此它默认离线可用；用户在页面中配置同步服务后，WebView 才会访问该服务同步进度和检查内容版本。
 *
 * <p>这个类只做四件事，其余全部交给网页：
 * <ol>
 *   <li>把 WebView 配好（localStorage、viewport、禁止页面缩放）</li>
 *   <li>http(s) 外链交给系统浏览器，站内 file:// 链接留在 WebView 里</li>
 *   <li>返回键先走网页历史（站内是 hash 路由），到顶了再按一次才退出</li>
 *   <li>旋转/切主题时不重建 Activity（configChanges 已经在清单里声明）</li>
 * </ol>
 */
public class MainActivity extends Activity {

    /** 站内首页。站点的 hash 路由在这里继续工作。 */
    private static final String START_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private long lastBackAt = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /* 保留系统栏占位；网页与系统栏在同一主题下分别使用表面色和背景色。 */

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        applySystemBars(initialDark());
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        root.addView(web);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        /* 接口只接收 light/dark 主题标记，不开放文件、命令或网络能力。 */
        web.addJavascriptInterface(new ThemeBridge(), "CloudCmdAndroid");
        /* localStorage 必须开：学习进度、收藏、"已掌握"、每日一练的间隔重复全存在这里 */
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        /* 站内页面是 file://，跨设备同步 API 可能是 https://；服务端必须启用 CORS。
           不配置同步服务时不会发起网络请求。 */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowUniversalAccessFromFileURLs(true);
        }
        /* 让网页自己的 <meta name="viewport"> 生效，否则手机上会按桌面宽度渲染 */
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        /* 页面里已经有触摸友好的字号与布局，这里不要再叠加缩放 */
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        /* 让部署网页知道当前 APK 版本；点击更新时交给系统浏览器下载新包。 */
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (info.versionName != null && !info.versionName.isEmpty()) {
                s.setUserAgentString(s.getUserAgentString() + " CloudCmdApp/" + info.versionName + " CloudCmdCode/" + info.versionCode);
            }
        } catch (Throwable ignored) {
            /* 版本标记失败不影响离线使用 */
        }
        /* 尊重系统文字大小；网页的响应式布局负责处理较大的文字。 */

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternally(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternally(request.getUrl() == null ? null : request.getUrl().toString());
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    private boolean initialDark() {
        String mode = getPreferences(MODE_PRIVATE).getString("theme_mode", "auto");
        if ("dark".equals(mode)) return true;
        if ("light".equals(mode)) return false;
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applySystemBars(boolean dark) {
        int surface = Color.parseColor(dark ? "#171F2B" : "#FFFFFF");
        int background = Color.parseColor(dark ? "#0D121B" : "#F5F7FB");
        try {
            getWindow().setStatusBarColor(surface);
            getWindow().setNavigationBarColor(background);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                getWindow().setNavigationBarContrastEnforced(false);
            }
            View decor = getWindow().getDecorView();
            int flags = decor.getSystemUiVisibility();
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            if (!dark) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
            }
            decor.setSystemUiVisibility(flags);
            if (web != null) web.setBackgroundColor(background);
        } catch (Throwable ignored) {
            /* 系统栏配色失败不影响页面 */
        }
    }

    private final class ThemeBridge {
        @JavascriptInterface
        public void setTheme(final String mode, final String effective) {
            if (!("auto".equals(mode) || "light".equals(mode) || "dark".equals(mode))) return;
            if (!("light".equals(effective) || "dark".equals(effective))) return;
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    getPreferences(MODE_PRIVATE).edit().putString("theme_mode", mode).apply();
                    applySystemBars("dark".equals(effective));
                }
            });
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if ("auto".equals(getPreferences(MODE_PRIVATE).getString("theme_mode", "auto"))) {
            applySystemBars((newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK)
                    == Configuration.UI_MODE_NIGHT_YES);
        }
    }

    /**
     * 站内链接（file://）留在 WebView 里；其余一律交给系统浏览器。
     *
     * <p>站内页面仍留在 WebView，用户配置的同步 API 由网页通过 XHR/EventSource 访问；
     * 官方文档链接继续交给系统浏览器打开。
     *
     * @return true 表示"已经由我们处理掉了"，WebView 不要自己加载
     */
    private boolean openExternally(String url) {
        if (url == null) return false;
        if (url.startsWith("file://")) return false;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Throwable t) {
            Toast.makeText(this, "没有能打开这个链接的应用", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    /**
     * 返回键：站内是 hash 路由，所以先退网页历史；退到顶了再按一次才退出应用。
     * "再按一次退出" 是 Android 上最不容易误触的做法。
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web != null && web.canGoBack()) {
                web.goBack();
            } else {
                long now = System.currentTimeMillis();
                if (now - lastBackAt < 2000L) {
                    finish();
                } else {
                    lastBackAt = now;
                    Toast.makeText(this, "再按一次返回退出", Toast.LENGTH_SHORT).show();
                }
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setWebViewClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
