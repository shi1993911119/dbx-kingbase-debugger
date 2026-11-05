package main

import "testing"

func TestJavaMajor(t *testing.T) {
	for _, test := range []struct {
		output string
		want   int
	}{
		{`java version "1.8.0_333"`, 8}, {`openjdk version "9.0.4"`, 9},
		{`java version "10.0.2"`, 10}, {`openjdk version "11.0.29" 2025-10-21`, 11},
		{`openjdk version "17.0.17"`, 17}, {`openjdk 21.0.9 2025-10-21 LTS`, 21},
		{`unrecognized runtime`, 0},
	} {
		if got := javaMajor(test.output); got != test.want {
			t.Errorf("version %q: got %d want %d", test.output, got, test.want)
		}
	}
}
