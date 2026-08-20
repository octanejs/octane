import { hasAuthParams } from "../src/utils";
import { createLocation } from "./helpers";

describe("utils hasAuthParams", () => {
    it.each([
        // query
        ["?code=1", ""],
        ["?foo=1&code=2", ""],
        ["?code=1&foo=2", ""],
        // fragment
        ["", "#code=1&foo=2"],
        ["", "#foo=1&code=2"],
        ["", "#code=1&foo=2"],
    ])("should not recognize only the code param in location { search: '%s', hash: '%s' }", (search, hash) => {
        // arrange
        const location = createLocation(search, hash);

        // act
        const result = hasAuthParams(location);

        // assert
        expect(result).toBeFalsy();
    });

    it.each([
        // query
        ["?code=1&state=2", ""],
        ["?foo=1&state=2&code=3", ""],
        ["?code=1&foo=2&state=3", ""],
        ["?state=1&code=2&foo=3", ""],
        // fragment
        ["", "#code=1&state=2"],
        ["", "#foo=1&state=2&code=3"],
        ["", "#code=1&foo=2&state=3"],
        ["", "#state=1&code=2&foo=3"],
    ])("should recognize the code and state param in location { search: '%s', hash: '%s' }", (search, hash) => {
        // arrange
        const location = createLocation(search, hash);

        // act
        const result = hasAuthParams(location);

        // assert
        expect(result).toBeTruthy();
    });

    it.each([
        // query
        ["?error=1&state=2", ""],
        ["?foo=1&state=2&error=3", ""],
        ["?error=1&foo=2&state=3", ""],
        ["?state=1&error=2&foo=3", ""],
        // fragment
        ["", "#error=1&state=2"],
        ["", "#foo=1&state=2&error=3"],
        ["", "#error=1&foo=2&state=3"],
        ["", "#state=1&error=2&foo=3"],
    ])("should recognize the error and state param in location { search: '%s', hash: '%s' }", (search, hash) => {
        // arrange
        const location = createLocation(search, hash);

        // act
        const result = hasAuthParams(location);

        // assert
        expect(result).toBeTruthy();
    });

    it.each([
        // query
        ["?error=1", ""],
        ["?foo=1&error=2", ""],
        ["?error=1&foo=2", ""],
        // fragment
        ["", "#error=1"],
        ["", "#foo=1&error=2"],
        ["", "#error=1&foo=2"],
    ])("should ignore the error param without state param in location { search: '%s', hash: '%s' }", (search, hash) => {
        // arrange
        const location = createLocation(search, hash);

        // act
        const result = hasAuthParams(location);

        // assert
        expect(result).toBeFalsy();
    });

    it.each([
        ["", ""],
        // query
        ["?", ""],
        ["?foo=1", ""],
        ["?code=&foo=2", ""],
        ["?error=", ""],
        // fragment
        ["", "#"],
        ["", "#foo=1"],
        ["", "#code=&foo=2"],
        ["", "#error="],
    ])("should ignore invalid params in location { search: '%s', hash: '%s' }", (search, hash) => {
        // arrange
        const location = createLocation(search, hash);

        // act
        const result = hasAuthParams(location);

        // assert
        expect(result).toBeFalsy();
    });
});
