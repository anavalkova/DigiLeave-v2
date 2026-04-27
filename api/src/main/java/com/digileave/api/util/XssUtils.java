package com.digileave.api.util;

import java.util.regex.Pattern;

public final class XssUtils {

    private static final Pattern HTML_TAGS = Pattern.compile("<[^>]+>");

    private XssUtils() {}

    /**
     * Strips HTML tags from a string to prevent stored XSS.
     * Returns null when input is null.
     */
    public static String sanitize(String input) {
        if (input == null) return null;
        return HTML_TAGS.matcher(input).replaceAll("").trim();
    }
}
