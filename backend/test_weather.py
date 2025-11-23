from weather_service import get_weather_and_alerts, WeatherError

def main():
    # Norlin Library-ish coordinates
    lat = 40.0076
    lon = -105.2659

    try:
        data = get_weather_and_alerts(lat, lon)
        print("Current weather:")
        print(data["current"])
        print("\nCustom alerts:")
        for a in data["custom_alerts"]:
            print("-", a["severity"], "-", a["title"])
    except WeatherError as e:
        print("WeatherError:", e)
    except Exception as e:
        print("Unexpected error:", repr(e))

if __name__ == "__main__":
    main()
